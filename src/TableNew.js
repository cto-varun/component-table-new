import React, { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Table, Icon, Input, Button } from 'antd';
import NumberFormat from 'react-number-format';
import day from 'dayjs';
import groupBy from 'lodash.groupby';
import isEqual from 'lodash.isequal';
import cloneDeep from 'lodash.clonedeep';
import * as sqrl from 'squirrelly';

import { name } from '../package.json';

const LOWER_THAN = 'lt';
const LOWER_OR_EQUAL_THAN = 'lte';
const EQUAL = 'eq';
const GREATER_THAN = 'gt';
const GREATER_OR_EQUAL_THAN = 'gte';
const REGEX = 'regex';
const LIMIT_FILTER_GROUPS = 3;

const FormattedCell = (props) => {
    const cell = useRef();

    const { field, type, format, record, ...restProps } = props;

    if (!format || ['number', 'date'].indexOf(type) === -1) {
        return (
            <td ref={cell} {...restProps}>
                {/* Temporarily commenting out this next line until I figure out how the alerts work - Michael */}
                {/* {props.alert.badge && <Badge status={props.alert.badge} /> } */}
                {restProps.children}
            </td>
        );
    }

    if (type === 'number') {
        return (
            <td ref={cell} {...restProps}>
                {/* Temporarily commenting out this next line until I figure out how the alerts work - Michael */}
                {/* {props.alert.badge && <Badge status={props.alert.badge} /> } */}
                <NumberFormat
                    format={format}
                    value={record[field]}
                    displayType="text"
                />
            </td>
        );
    }

    if (type === 'date') {
        return (
            <td ref={cell} {...restProps}>
                {/* Temporarily commenting out this next line until I figure out how the alerts work - Michael */}
                {/* {props.alert.badge && <Badge status={props.alert.badge} /> } */}
                {day(record[field]).format(format)}
            </td>
        );
    }

    return null;
};

FormattedCell.propTypes = {
    field: PropTypes.string,
    type: PropTypes.string.isRequired,
    format: PropTypes.string.isRequired,
    record: PropTypes.objectOf(
        PropTypes.oneOfType([PropTypes.number, PropTypes.string])
    ),
};

FormattedCell.defaultProps = {
    field: '',
    record: {},
};

const TableNew = (props) => {
    const {
        data: propData,
        properties: {
            context,
            dataProcessingFunction,
            mainTableRootClassName,
            pagination,
            rowSelection,
            groupedByField = '',
            fieldsConfiguration = [],
            hideColumnTitleIfEmpty,
            hideAllColumnFilters,
            shouldSkipColumnsProcessing = false,
            sorting,
            alerts = [],
            unwantedFields,
            template = '',
            bordered,
            header,
            footer,
            maxHeight,
            minWidth,
            rowClassName,
            rowSelectionNotifyFunctions,
            dropdownNotifyFunctionName,
            conflictingValuesModalFunctionName,
            displayRowErrors,
            errorObjectFieldName,
            errorColumnToCheck,
        },
        nestedTableProperties,
        handlers,
        associatedFilters,
        datasource,
        component: { id },
    } = props;

    // Needed for IE 11
    const crossBrowserEval = (input) => {
        if (window[window.sessionStorage?.tabId].execScript) {
            window[window.sessionStorage?.tabId].execScript(input);

            return null;
        }
        // eslint-disable-next-line no-eval
        return window[window.sessionStorage?.tabId].eval
            ? window[window.sessionStorage?.tabId].eval(input)
            : eval(input);
    };

    const { dataArray } = window[window.sessionStorage?.tabId].dp
        .load({ propData })
        .extractData({
            extract: [
                {
                    property: 'propData',
                    name: 'dataArray',
                    transformations: [
                        (data) => {
                            if (dataProcessingFunction) {
                                const { result } = crossBrowserEval(
                                    dataProcessingFunction
                                )(data);
                                return result;
                            }
                            return data.map((dataObj) => {
                                let newDataObj = dataObj.execute
                                    ? dataObj.execute()
                                    : dataObj;
                                newDataObj = newDataObj.map((obj, index) => {
                                    const newObj = obj;
                                    newObj.key = index;
                                    return newObj;
                                });
                                return newDataObj;
                            });
                        },
                    ],
                },
            ],
        });

    // custom business logic for removing reserved accounts from data list
    const filterReservedAccounts = (arr) =>
        arr?.filter((item) => item?.ptnStatus !== 'Reserved');

    let data = [filterReservedAccounts(dataArray)];
    window[window.sessionStorage?.tabId]['data'] = data;

    if (dataArray && Array.isArray(dataArray[0]) && !dataArray[0].length) {
        data = [[]];
    }

    const [sorter, setSorter] = useState();

    const isLoading = () => !propData;

    const isNormal = () => !isLoading();

    /**
     * If props handlers has onDataClick handler
     * each field become filterable.
     */
    const columnFilters = (field) => {
        if (
            hideAllColumnFilters ||
            !handlers ||
            !handlers.onFilterSet ||
            !handlers.onFilterRemove
        ) {
            return {};
        }

        const { onFilterSet, onFilterRemove } = handlers;
        let lastSearch;

        const handleSearch = (value, confirm) => () => {
            lastSearch = value;
            onFilterSet(field, 'equal', value);
            confirm();
        };

        const handleReset = (clearFilters) => () => {
            onFilterRemove(field, 'equal', lastSearch);
            clearFilters();
        };

        const getFilterValue = () => {
            const result = associatedFilters.filter(
                (item) => item.field === field
            );
            if (result.length) {
                return result[0].value;
            }

            return null;
        };

        let searchInput;
        return {
            filterDropdown: ({
                setSelectedKeys,
                selectedKeys,
                confirm,
                clearFilters,
            }) => (
                <div className="table-filter-dropdown">
                    <Input
                        ref={(ele) => {
                            searchInput = ele;
                        }}
                        placeholder="Search value"
                        value={selectedKeys}
                        onChange={(e) => setSelectedKeys(e.target.value)}
                        onPressEnter={handleSearch(selectedKeys, confirm)}
                    />
                    <Button
                        type="primary"
                        onClick={handleSearch(selectedKeys, confirm)}
                    >
                        Search
                    </Button>
                    <Button onClick={handleReset(clearFilters)}>Reset</Button>
                </div>
            ),
            filteredValue: getFilterValue(),
            onFilterDropdownVisibleChange: (visible) => {
                if (visible) {
                    setTimeout(() => {
                        searchInput.focus();
                    });
                }
            },
        };
    };

    /* eslint-disable complexity */
    /**
     * Execute alert rules. First rule applied stops rule execution on a field
     * @param {Object} record
     * @param {String} requiredField The only field to check agains rules
     * @return {String} Row status based on rule output.
     */
    const getRowStatus = (record, requiredField) => {
        for (let idx = 0; idx < alerts.length; idx += 1) {
            const { fieldName, functionName, value, state, badge } = alerts[
                idx
            ];
            const fieldValue = record[fieldName];

            if (
                (typeof requiredField === 'undefined' ||
                    fieldName === requiredField) &&
                typeof fieldValue !== 'undefined'
            ) {
                switch (functionName) {
                    case EQUAL:
                        if (fieldValue === value) return { state, badge };
                        break;
                    case LOWER_OR_EQUAL_THAN:
                        if (fieldValue <= value) return { state, badge };
                        break;
                    case LOWER_THAN:
                        if (fieldValue < value) return { state, badge };
                        break;
                    case GREATER_THAN:
                        if (fieldValue > value) return { state, badge };
                        break;
                    case GREATER_OR_EQUAL_THAN:
                        if (fieldValue >= value) return { state, badge };
                        break;
                    case REGEX:
                        if (new RegExp(value, 'i').test(fieldValue)) {
                            return { state, badge };
                        }
                        break;
                    default:
                        break;
                }
            }
        }

        return { state: null, badge: null };
    };
    /* eslint-enable complexity */

    const onHeaderCellClick = (column, event) => {
        const { key, order } = column;
        const isControlPressed = window[
            window.sessionStorage?.tabId
        ].navigator.platform.match('Mac')
            ? event.metaKey
            : event.ctrlKey;

        let newSorter = cloneDeep(sorter);
        let index = newSorter.findIndex((a) => a.key === key);

        if (index > -1) {
            if (!isControlPressed) {
                newSorter = [newSorter[index]];
                index = 0;
            }

            switch (newSorter[index].order) {
                case 'descend':
                    newSorter[index].order = 'ascend';
                    break;

                case 'ascend':
                    newSorter.splice(index, 1);
                    break;
                default:
            }
        } else {
            if (!isControlPressed) {
                newSorter.splice(0, newSorter.length);
            }

            newSorter.push({
                key,
                index: order,
                order: 'descend',
                sorter: column.sorter,
            });
        }

        if (!isEqual(sorter, newSorter)) {
            setSorter(newSorter);
        }
    };

    const getGroupedByField = () => {
        if (!groupedByField || groupedByField === '') {
            return [];
        }

        return groupedByField
            .replace(/\s/g, '')
            .split(',', LIMIT_FILTER_GROUPS)
            .filter(
                (item) =>
                    data &&
                    data[0] &&
                    data.length &&
                    data[0].length &&
                    data[0][0][item]
            );
    };

    const getColumnConfig = (sourceFieldName, propName) => {
        for (let idx = 0; idx < fieldsConfiguration.length; idx += 1) {
            const config = fieldsConfiguration[idx];

            if (config.fieldName === sourceFieldName) {
                if (config[propName]) {
                    return config[propName];
                }

                if (propName === undefined) {
                    return config;
                }
            }
        }

        return undefined;
    };

    const getAlign = (sourceFieldName) => {
        return getColumnConfig(sourceFieldName, 'align');
    };

    const getFormat = (sourceFieldName) => {
        return getColumnConfig(sourceFieldName, 'format');
    };

    const getWidth = (sourceFieldName) => {
        const width = parseInt(getColumnConfig(sourceFieldName, 'width'), 10);
        return Number.isNaN(width) ? undefined : width;
    };

    const getLabel = (sourceFieldName) => {
        const label = getColumnConfig(sourceFieldName, 'displayName');
        if (label && label !== '') {
            return label;
        }
        if (hideColumnTitleIfEmpty) {
            return '';
        }
        return sourceFieldName;
    };

    const getRenderString = (string, columnConfig) => {
        let renderString;

        // fieldsConfiguration we need to pass this thing as a argument
        if (columnConfig) {
            columnConfig.forEach((obj) => {
                if (string === obj.fieldName) {
                    renderString = obj.render;
                }
            });
        }
        return renderString;
    };

    const getFixed = (sourceFieldName) => {
        return getColumnConfig(sourceFieldName, 'fixed');
    };

    const swapElement = (array, indexA, indexB) => {
        const newArray = array;
        const tmp = newArray[indexA];
        newArray[indexA] = array[indexB];
        newArray[indexB] = tmp;
        return newArray;
    };

    const arrangeFields = (fieldsConfig, formattedFields) => {
        let array = [...formattedFields];
        if (fieldsConfig && fieldsConfig.length > 0) {
            fieldsConfig.forEach((obj, upperIndex) => {
                array.forEach((dataObj, lowerIndex) => {
                    if (
                        dataObj.children === undefined &&
                        obj.fieldName === dataObj.key
                    ) {
                        array = swapElement(array, upperIndex, lowerIndex);
                    }
                });
            });
        }
        return fieldsConfig && fieldsConfig.length > 0
            ? array
            : formattedFields;
    };

    /**
     * Below function removes the unwanted column
     */
    const handleUnwantedColumn = (array) => {
        const result = array;
        if (unwantedFields) {
            unwantedFields.forEach((ref) => {
                result.forEach((obj, index) => {
                    if (ref.columnName === obj.key) {
                        result.splice(index, 1);
                    }
                });
            });
        }
        return result;
    };

    /**
     * Group columns featuree
     *
     * @layout
     * |-------------|
     * | Column Name |
     * |------|------|
     * | Sub1 | Sub2 |
     * |======|======|
     * | V 1  | V 2  |
     */
    const regroupColumns = (formattedFields, fieldsConfig) => {
        const formattedFieldsCopy = formattedFields;
        const fieldNamesToGroups = fieldsConfig
            .filter(({ group }) => group && group !== '')
            .reduce(
                (acc, { fieldName, group }) => ({ ...acc, [fieldName]: group }),
                {}
            );

        const groupContext = groupBy(
            formattedFieldsCopy,
            ({ dataIndex }) => fieldNamesToGroups[dataIndex]
        );
        const pendingDeletion = [];

        delete groupContext.undefined;

        Object.keys(groupContext).forEach((title) => {
            const children = groupContext[title];
            const { order } = children[0];
            const key = `group-${title}`;
            const groupElement = {
                key,
                title,
                order,
                children,
            };

            formattedFieldsCopy[order] = groupElement;
            children.forEach(({ order: childOrder }, index) => {
                if (index > 0) {
                    pendingDeletion.push(childOrder);
                }
            });
        });

        pendingDeletion.forEach((index) =>
            formattedFieldsCopy.splice(index, 1)
        );

        // NOTE: FIXME
        // If we divide the code in sub catogery then code will break
        // This issue is resolved with temperary fix
        // Need to work on this
        const arrangedFields = arrangeFields(
            fieldsConfiguration,
            formattedFieldsCopy
        );
        let flag = false;
        formattedFieldsCopy.forEach((field) => {
            if (flag === false && field.children && field.children.length > 0) {
                flag = true;
            }
        });

        if (flag) {
            return handleUnwantedColumn(formattedFieldsCopy);
        }
        return handleUnwantedColumn(arrangedFields);
    };

    /**
     * Extract information about coluns from a first row of data
     *
     * @return {Array} Columns
     */
    // eslint-disable-next-line complexity
    const columns = () => {
        if (!(isNormal() && data && data[0] && data.length && data[0].length)) {
            return undefined;
        }

        let firstRow = null;

        data.forEach((obj) => {
            firstRow = {
                ...firstRow,
                ...obj[0],
            };
        });

        const getTitle = (label, sortOrder) => {
            return sorting && sortOrder ? (
                <div>
                    {sqrl.Render(label, [])}
                    <div className="ant-table-column-sorter">
                        <Icon
                            type="caret-up"
                            className={`caret ant-table-column-sorter-up ${
                                sortOrder === 'ascend' ? 'on' : ''
                            }`}
                        />
                        <Icon
                            type="caret-down"
                            className={`caret ant-table-column-sorter-down ${
                                sortOrder === 'descend' ? 'on' : ''
                            }`}
                        />
                    </div>
                </div>
            ) : (
                label
            );
        };

        const getSortOrder = (field) => {
            if (sorting && sorter) {
                const sort = sorter.find((s) => s.key === field);
                if (sort) {
                    return sort.order;
                }
            }
            return false;
        };

        const renderHtmlNode = (text, templateString) => {
            const html = sqrl.Render(
                templateString === undefined || templateString.length < 3
                    ? '{{data}}'
                    : templateString,
                { data: text } || []
            );
            return <div dangerouslySetInnerHTML={{ __html: html }} />;
        };

        const columnData = (
            field,
            type,
            format,
            width,
            fixed,
            order,
            label,
            align,
            htmlNode
        ) => ({
            format,
            fixed,
            order,
            width,
            dataIndex: field,
            key: field,
            title: getTitle(label, getSortOrder(field)),
            align,
            render: (text) => renderHtmlNode(text, htmlNode),
            ...columnFilters(field),
            onCell: (record) => ({
                field,
                type,
                format,
                record,
                alert: getRowStatus(record, field),
            }),
            sorting: sorting ? sorting(field, type) : false,
            onHeaderCell: sorting
                ? (column) => ({
                      className: 'table-cell__sorted',
                      onClick: (event) => onHeaderCellClick(column, event),
                  })
                : undefined,
        });

        const guessType = (targetFieldName, dataObj) => {
            for (let idx = 0; idx < datasource.length; idx += 1) {
                const { name: fieldName, type } = datasource[idx];
                if (fieldName === targetFieldName) {
                    return type;
                }
            }

            const t = parseFloat(dataObj);
            if (Number.isNaN(t)) {
                return typeof dataObj;
            }
            return 'number';
        };

        const groups = getGroupedByField();
        let fieldNamesAndTypes = Object.keys(firstRow).map((field) => ({
            field,
            type: guessType(field, firstRow[field]),
        }));

        if (groups.length) {
            fieldNamesAndTypes = fieldNamesAndTypes.sort((a, b) => {
                let indexA = groups.indexOf(a.field);
                let indexB = groups.indexOf(b.field);
                if (indexA === -1) indexA = 10;
                if (indexB === -1) indexB = 10;

                return indexA - indexB;
            });
        }

        const getProperColumnStructuer = (
            refForStructuer,
            rewColumnStructure
        ) => {
            return refForStructuer.map(({ field, type }, order) => {
                return columnData(
                    field,
                    type,
                    getFormat(field),
                    getWidth(field),
                    getFixed(field),
                    order,
                    getLabel(field),
                    getAlign(field),
                    getRenderString(field, rewColumnStructure)
                );
            });
        };

        /**
         * getProperColumnStructuer Function reduce the redandancy for the code
         * First argument is column structuer in proper formate
         * Second is a column config that we get from the props
         */
        const formattedFields = getProperColumnStructuer(
            fieldNamesAndTypes,
            fieldsConfiguration
        );

        return regroupColumns([...formattedFields], fieldsConfiguration);
    };

    const [filteredData, setFilteredData] = useState([]);
    const [filteredColumnStructure, setFilteredColumnStructure] = useState();
    const [displayBackButton, setDisplayBackButton] = useState(false);

    /**
     * TRY NOT TO TOUCH THIS PART OF CODE
     * This code is used by the Cueernt Table componenet
     */
    const filterData = (key, value) => {
        let newFilteredColumnStructure = filteredColumnStructure || columns();
        newFilteredColumnStructure = newFilteredColumnStructure?.filter(
            (item) => item.key !== key
        );
        if (!isEqual(filteredColumnStructure, newFilteredColumnStructure)) {
            setFilteredColumnStructure(newFilteredColumnStructure);
            setDisplayBackButton(true);
        }
        /**
         * I need to take care of data too
         * Depending on the value I need to filter the data and show the perticular data
         */
        let newFilteredData = data[0];
        newFilteredData = newFilteredData.filter(
            (obj) => obj[key] === value.toString()
        );
        if (!isEqual(filteredData, newFilteredData)) {
            setFilteredData(newFilteredData);
        }
    };

    const retrieveDataFromStorage = () => {
        if (!isNormal()) {
            return;
        }

        if (!isEqual(filteredData, data[0])) {
            setFilteredData(data[0]);
        }
    };

    const resetDataAndColumns = () => {
        setFilteredColumnStructure(
            shouldSkipColumnsProcessing ? fieldsConfiguration : columns()
        );
        retrieveDataFromStorage();
        setDisplayBackButton(false);
    };

    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    useEffect(
        function handleIMEISearchDisable() {
            if (document.getElementById('whitelist-imei-input')) {
                document.getElementById('whitelist-imei-input').disabled =
                    selectedRowKeys.length > 0;
            }

            if (
                document.querySelector('.search-imei.ant-input-affix-wrapper')
            ) {
                selectedRowKeys.length > 0
                    ? document
                          .querySelector('.search-imei.ant-input-affix-wrapper')
                          .classList.add('ant-input-affix-wrapper-disabled')
                    : document
                          .querySelector('.search-imei.ant-input-affix-wrapper')
                          .classList.remove('ant-input-affix-wrapper-disabled');
            }
        },
        [selectedRowKeys]
    );

    // if the amont of selected rows is equal to max rows, we will
    // assume that the select toggle

    const [maxRows] = useState(data?.[0]?.length);
    const toggleStatus = React.useRef('toggle/untouched');

    const onRowSelectionChange = (newSelectedRowKeys, newSelectedRows) => {
        const imeiSearchForm =
            window[window.sessionStorage?.tabId][
                'css-whitelist-imei-search-form'
            ]?.state?.formData;
        if (imeiSearchForm) {
            if (imeiSearchForm['whitelist-imei-input']?.value) {
                window[window.sessionStorage?.tabId][
                    'conflicting-values-modal-templateupdateTemplateData'
                ]({
                    userSelectionConflictMessage: 'imei',
                });
                window[window.sessionStorage?.tabId].sendconflictingValuesModal(
                    'OPEN'
                );
                return;
            }
        }

        setSelectedRowKeys(newSelectedRowKeys);
        window[window.sessionStorage?.tabId]['changeOnRows'] = true;

        if (rowSelectionNotifyFunctions) {
            rowSelectionNotifyFunctions.forEach((functionName) => {
                if (
                    window[window.sessionStorage?.tabId][functionName] &&
                    typeof window[window.sessionStorage?.tabId][
                        functionName
                    ] === 'function'
                ) {
                    window[window.sessionStorage?.tabId][functionName](
                        newSelectedRows
                    );
                }
            });
        }
    };

    const notifyRowSelection = (newlySelectedRows) => {
        // this function is called from onRowSelectionChange
        // this function handles what needs to be done after receiving data about selected rows
        const dropdownNotifyFunction =
            window[window.sessionStorage?.tabId][dropdownNotifyFunctionName];
        if (!newlySelectedRows || newlySelectedRows.length === 0) {
            dropdownNotifyFunction([]);
            toggleStatus.current = 'toggle/untouched';

            return;
        }
        const key = rowSelection && rowSelection.columnKeyToCheck;
        if (!columns) {
            return;
        }
        const value = newlySelectedRows[0][key];

        let allValuesMatch = true;

        const keysToSelect = [];
        newlySelectedRows.forEach((row) => {
            if (row[key] !== value) {
                allValuesMatch = false;
            } else {
                keysToSelect.push(row.key);
            }
        });

        if (newlySelectedRows.length === maxRows) {
            if (
                toggleStatus.current === 'toggle/untouched' ||
                toggleStatus.current === 'toggle/off'
            ) {
                const filteredDataRows = newlySelectedRows.filter((row) =>
                    keysToSelect.includes(row.key)
                );
                dropdownNotifyFunction(filteredDataRows);
                window[
                    window.sessionStorage?.tabId
                ].newlySelectedRows = filteredDataRows;
                setSelectedRowKeys(filteredDataRows.map((r) => r.key));
                toggleStatus.current = 'toggle/on';
            } else if (toggleStatus.current === 'toggle/on') {
                dropdownNotifyFunction([]);
                window[window.sessionStorage?.tabId].newlySelectedRows = [];
                setSelectedRowKeys([]);
                toggleStatus.current = 'toggle/off';
            }
        } else if (allValuesMatch) {
            dropdownNotifyFunction(newlySelectedRows);
            window[
                window.sessionStorage?.tabId
            ].newlySelectedRows = newlySelectedRows;
            toggleStatus.current = 'toggle/off';
        } else {
            window[window.sessionStorage?.tabId][
                conflictingValuesModalFunctionName
            ]('OPEN');
            dropdownNotifyFunction(
                newlySelectedRows.filter((row) =>
                    keysToSelect.includes(row.key)
                )
            );
            setSelectedRowKeys(keysToSelect);
            toggleStatus.current = 'toggle/untouched';
        }
    };

    const displayErrorMessages = (errorResponses) => {
        const errorMap = {};
        let shouldProceedToNextRestoreScreen = true;
        let total = 0;
        const results = errorResponses?.payload?.results;
        results.forEach((response) => {
            if (!response.isSuccess) {
                if (context === 'change-status-customer-line-table') {
                    const findDollarAmountFromStringRegex = /[$]\d+([.]\d{1,2})*/;
                    const dollarAmount = response?.description?.match(
                        findDollarAmountFromStringRegex
                    );

                    total += parseFloat(
                        dollarAmount &&
                            dollarAmount[0] &&
                            typeof dollarAmount[0] &&
                            dollarAmount[0].startsWith('$')
                            ? dollarAmount[0].slice(1)
                            : 0
                    );
                    if (dollarAmount !== null) {
                        window[
                            window.sessionStorage?.tabId
                        ].shouldTakeToPaymentForm = true;
                    }
                }
                errorMap[
                    response[errorObjectFieldName]
                ] = `${response?.description} Amount due: ${response?.amount}`;
                shouldProceedToNextRestoreScreen = false;

                if (
                    window[sessionStorage.tabId]?.alasql?.tables
                        ?.datasource_360_customer_view?.data?.length &&
                    window[sessionStorage.tabId]?.alasql?.tables
                        ?.datasource_360_customer_view?.data?.length > 0
                ) {
                    const subscribers =
                        window[sessionStorage.tabId]?.alasql?.tables
                            ?.datasource_360_customer_view?.data?.[0]?.account
                            ?.subscribers;
                    const subscriberInfo = subscribers.find(
                        (sub) =>
                            sub.subscriberDetails?.phoneNumber == response.ptn
                    );
                    if (
                        subscriberInfo &&
                        subscriberInfo.subscriberDetails?.pendingPortInIndicator
                    ) {
                        errorMap[
                            response[errorObjectFieldName]
                        ] = `This activity cannot be performed due to open port in or port out requests for this subscriber on the account.`;
                        shouldProceedToNextRestoreScreen = false;
                    }
                    if (
                        subscriberInfo &&
                        subscriberInfo.subscriberDetails?.status === 'C' &&
                        subscriberInfo.subscriberDetails?.subStatusLastAct ===
                            'MCN'
                    ) {
                        errorMap[
                            response[errorObjectFieldName]
                        ] = `CTN is in use by another account. Unable to restore CTN.`;
                        shouldProceedToNextRestoreScreen = false;
                    }
                    if (
                        window[sessionStorage.tabId]?.[
                            'change-status-section-dropdowngetDropdownStatusValues'
                        ]?.status === 'Restore' &&
                        subscriberInfo &&
                        (subscriberInfo.subscriberDetails
                            ?.pendingPortInIndicator ||
                            subscriberInfo.subscriberDetails
                                ?.statusReasonCode === 'PO')
                    ) {
                        errorMap[
                            response[errorObjectFieldName]
                        ] = `CTN is part of a port out or port in and cannot be restored.`;
                        shouldProceedToNextRestoreScreen = false;
                    }
                }
            }
        });

        window[
            window.sessionStorage?.tabId
        ].restoreCancelledLinesTotalAmountDue = `$${total.toFixed(2)}`;

        window[
            window.sessionStorage?.tabId
        ].shouldProceedToNextRestoreScreen = shouldProceedToNextRestoreScreen;
        const newRowData =
            data &&
            data[0] &&
            data[0].map((row) => {
                const rowCopy = cloneDeep(row);
                const columnValue = rowCopy[errorColumnToCheck];
                if (errorMap[columnValue]) {
                    rowCopy.errorMessage = errorMap[columnValue];
                }
                return rowCopy;
            });
        setFilteredData(newRowData);

        if (shouldProceedToNextRestoreScreen === true) {
            setTimeout(() => {
                window[window.sessionStorage?.tabId][
                    'change-status-step--next'
                ]();
            }, 500);
        } else {
            setTimeout(() => {
                if (
                    typeof window[sessionStorage?.tabId][
                        'change-status-step-1-next-button_showButton'
                    ] === 'function'
                ) {
                    window[sessionStorage?.tabId][
                        'change-status-step-1-next-button_showButton'
                    ]();
                }
                if (
                    document.querySelector(
                        '.change-status-step-1-next-button-button'
                    ) &&
                    document.querySelector(
                        '.change-status-step-1-next-button-button'
                    ).innerHTML
                ) {
                    document.querySelector(
                        '.change-status-step-1-next-button-button'
                    ).innerHTML = '<span>CONTINUE</span>';
                }
            }, 500);
        }
    };

    const updateTableData = ({ payload }) => {
        // delete payload.status;
        // delete payload.responseStatus;

        const fieldNames = fieldsConfiguration.map(
            (column) => column.fieldName
        );

        const rowData = [];
        for (let i = 0; payload[i] !== undefined; i += 1) {
            const row = {
                key: i,
            };
            fieldNames.forEach((field) => {
                row[field] = payload[i][field];
            });
            rowData.push(row);
        }

        data = [rowData];
        // setFilteredData(data[0]);
        resetDataAndColumns();
    };

    useEffect(() => {
        if (filteredColumnStructure === undefined) {
            setFilteredColumnStructure(
                shouldSkipColumnsProcessing ? fieldsConfiguration : columns()
            );
        }

        if (data && data[0]) {
            setFilteredData(data[0]);
        }

        if (id !== undefined) {
            window[window.sessionStorage?.tabId][id] = (key, value) =>
                filterData(key, value);
            window[window.sessionStorage?.tabId][
                `${id}displayErrorMessages`
            ] = displayErrorMessages;
            window[window.sessionStorage?.tabId][
                `${id}resetDataAndColumns`
            ] = () => resetDataAndColumns();
            if (rowSelectionNotifyFunctions) {
                rowSelectionNotifyFunctions.forEach((functionName) => {
                    window[window.sessionStorage?.tabId][
                        functionName
                    ] = notifyRowSelection;
                });
            }
            window[window.sessionStorage?.tabId][
                `${id}filteredData`
            ] = filteredData;
            window[window.sessionStorage?.tabId][
                `${id}setFilteredData`
            ] = setFilteredData;
            window[window.sessionStorage?.tabId][
                `${id}updateTableData`
            ] = updateTableData;
            window[window.sessionStorage?.tabId][
                `${id}resetSelectedRows`
            ] = () => setSelectedRowKeys([]);
        }

        return () => {
            if (id !== undefined) {
                delete window[window.sessionStorage?.tabId][id];
                delete window[window.sessionStorage?.tabId][
                    `${id}displayErrorMessages`
                ];
                delete window[window.sessionStorage?.tabId][
                    `${id}resetDataAndColumns`
                ];
                if (rowSelectionNotifyFunctions) {
                    rowSelectionNotifyFunctions.forEach((functionName) => {
                        delete window[window.sessionStorage?.tabId][
                            functionName
                        ];
                    });
                }
                delete window[window.sessionStorage?.tabId][
                    `${id}filteredData`
                ];
                delete window[window.sessionStorage?.tabId][
                    `${id}setFilteredData`
                ];
                delete window[window.sessionStorage?.tabId][
                    `${id}updateTableData`
                ];
                delete window[window.sessionStorage?.tabId][
                    `${id}resetSelectedRows`
                ];
            }
        };
    }, []);

    const backButtonVisible =
        displayBackButton === true
            ? { visibility: 'visible' }
            : { visibility: 'hidden' };

    /**
     * Working on HTML template for the table componenet
     * NOTE: Code is same as template component
     */
    const getTemplate = () => {
        try {
            const html = template;
            return sqrl.Render(html, []);
        } catch (e) {
            return e.message;
        }
    };

    const templateDiv = (
        <div
            className="device-history-html-template"
            style={backButtonVisible}
            dangerouslySetInnerHTML={{ __html: getTemplate() }}
        />
    );

    const defaultRowClassName = (record) => {
        const { state } = getRowStatus(record);

        if (state) {
            return `table-status-${state}`;
        }

        return undefined;
    };

    const isBordered = () => !!bordered;

    const components = () => ({
        body: {
            cell: FormattedCell,
        },
    });

    const paginationConfiguration = () => {
        if (typeof pagination === 'boolean') {
            return pagination;
        }

        const { position, pageSize, showPageSizeOptions = false } = pagination;
        return {
            showSizeChanger: showPageSizeOptions,
            position:
                position && position !== 'null' && position !== ''
                    ? position
                    : 'bottom',
            pageSize:
                pageSize && pageSize.length > 0 ? parseInt(pageSize, 10) : 10,
        };
    };

    const tableHeaderConfiguration = () => {
        if (header && header !== '') {
            return () => header;
        }

        return undefined;
    };

    const tableFooterConfiguration = () => {
        if (footer && footer !== '') {
            return () => footer;
        }

        return undefined;
    };

    const scrollY = () => {
        return parseInt(maxHeight, 10);
    };

    /**
     * A fixed value which is greater than table width for scroll.x is recommended.
     * The sum of unfixed columns should not greater than scroll.x.
     * NOTE: For more infformation refer antd documentation
     */
    const scrollX = () => {
        return parseInt(minWidth, 10);
    };

    const renderNestedTable = () => {
        if (!nestedTableProperties) return undefined;
        const {
            wrapperDivClassName,
            data: nestedTablesData,
        } = nestedTableProperties;
        if (!nestedTablesData || nestedTablesData.length === 0)
            return undefined;
        return {
            expandedRowRender: (record) => {
                const nestedTables = [];
                nestedTablesData.forEach(
                    ({
                        key,
                        className,
                        columns: nestedColumns = [],
                        pagination: nestedPagination = false,
                        rowClassName: nestedRowClassName,
                        getExtraData,
                    }) => {
                        const dataSource = record[key];
                        const extraData =
                            getExtraData && getExtraData(record, key);
                        if (dataSource && dataSource.length > 0) {
                            nestedTables.push(
                                <Table
                                    className={className}
                                    columns={nestedColumns}
                                    dataSource={dataSource}
                                    pagination={nestedPagination}
                                    rowClassName={
                                        nestedRowClassName &&
                                        ((nestedRecord, nestedIndex) =>
                                            nestedRowClassName(
                                                nestedRecord,
                                                nestedIndex,
                                                extraData
                                            ))
                                    }
                                />
                            );
                        }
                    }
                );
                return (
                    <div className={wrapperDivClassName}>
                        <div>{nestedTables}</div>
                    </div>
                );
            },
        };
    };

    const renderErrorMessages = () => {
        const expandedRowKeys = [];
        if (filteredData) {
            filteredData.forEach((record) => {
                if (record.errorMessage) {
                    expandedRowKeys.push(record.key);
                }
            });
        }
        return {
            expandedRowRender: (record) => (
                <p style={{ color: 'red', width: '300px' }}>
                    {record.errorMessage}
                </p>
            ),
            rowExpandable: (record) => !!record.errorMessage,
            defaultExpandAllRows: true,
            expandedRowKeys,
            expandIcon: () => undefined,
        };
    };

    const getExpandableProperty = () => {
        if (displayRowErrors) {
            return renderErrorMessages();
        }
        return renderNestedTable();
    };

    const getRowClassNameForChangeStatusCustomerLineTable = (record) => {
        if (selectedRowKeys.includes(record.key)) {
            return 'line-selected';
        }
        return '';
    };

    const getRowClassName = () => {
        switch (context) {
            case 'change-status-customer-line-table':
                return getRowClassNameForChangeStatusCustomerLineTable;
            default:
                return rowClassName || defaultRowClassName;
        }
    };

    const mainTableComponent = (
        <Table
            className={mainTableRootClassName}
            components={components()}
            bordered={isBordered()}
            columns={filteredColumnStructure}
            loading={isLoading()}
            title={tableHeaderConfiguration()}
            footer={tableFooterConfiguration()}
            pagination={paginationConfiguration()}
            rowClassName={getRowClassName()}
            scroll={{ x: scrollX(), y: scrollY() }}
            dataSource={filteredData}
            expandable={getExpandableProperty()}
            rowSelection={
                rowSelection && {
                    selectedRowKeys,
                    type: rowSelection.rowSelectionType,
                    hideSelectAll: rowSelection.hideSelectAll,
                    onChange: onRowSelectionChange,
                }
            }
        />
    );

    return (
        <div>
            {templateDiv}
            {mainTableComponent}
        </div>
    );
};

TableNew.lazy = false;

TableNew.componentName = name;

TableNew.propTypes = {
    data: PropTypes.arrayOf(
        PropTypes.oneOfType([PropTypes.func, PropTypes.string])
    ),
    properties: PropTypes.shape({
        context: PropTypes.string,
        dataProcessingFunction: PropTypes.string,
        mainTableRootClassName: PropTypes.string,
        pagination: PropTypes.oneOfType([
            PropTypes.bool,
            PropTypes.shape({
                position: PropTypes.string,
                pageSize: PropTypes.string,
                showPageSizeOptions: PropTypes.bool,
            }),
        ]),
        rowSelection: PropTypes.oneOfType([
            PropTypes.bool,
            PropTypes.shape({
                rowSelectionType: PropTypes.oneOf([
                    'checkbox',
                    'radio',
                    undefined,
                ]),
                hideSelectAll: PropTypes.bool,
            }),
        ]),
        groupedByField: PropTypes.string,
        fieldsConfiguration: PropTypes.array,
        hideColumnTitleIfEmpty: PropTypes.bool,
        hideAllColumnFilters: PropTypes.bool,
        shouldSkipColumnsProcessing: PropTypes.bool,
        sorting: PropTypes.func,
        alerts: PropTypes.array,
        unwantedFields: PropTypes.array,
        template: PropTypes.string,
        bordered: PropTypes.bool,
        header: PropTypes.string,
        footer: PropTypes.string,
        maxHeight: PropTypes.string,
        minWidth: PropTypes.string,
        rowClassName: PropTypes.func,
        rowSelectionNotifyFunctions: PropTypes.arrayOf(PropTypes.string),
        dropdownNotifyFunctionName: PropTypes.string,
        conflictingValuesModalFunctionName: PropTypes.string,
        displayRowErrors: PropTypes.bool,
        errorObjectFieldName: PropTypes.string,
        errorColumnToCheck: PropTypes.string,
    }),
    nestedTableProperties: PropTypes.shape({
        wrapperDivClassName: PropTypes.string,
        data: PropTypes.arrayOf(
            PropTypes.shape({
                key: PropTypes.string,
                className: PropTypes.string,
                columns: PropTypes.array,
                pagination: PropTypes.oneOfType([
                    PropTypes.bool,
                    PropTypes.object,
                ]),
                rowClassName: PropTypes.func,
            })
        ),
    }),
    handlers: PropTypes.objectOf(PropTypes.func),
    associatedFilters: PropTypes.arrayOf(),
    datasource: PropTypes.arrayOf(),
    component: {
        id: PropTypes.string,
    },
};

TableNew.defaultProps = {
    data: [],
    properties: {
        context: undefined,
        dataProcessingFunction: undefined,
        mainTableRootClassName: undefined,
        pagination: false,
        rowSelection: false,
        groupedByField: '',
        fieldsConfiguration: [],
        hideColumnTitleIfEmpty: false,
        hideAllColumnFilters: false,
        shouldSkipColumnsProcessing: false,
        sorting: undefined,
        alerts: [],
        unwantedFields: undefined,
        template: '',
        bordered: undefined,
        header: undefined,
        footer: undefined,
        maxHeight: undefined,
        minWidth: undefined,
        rowClassName: undefined,
        rowSelectionNotifyFunctions: [],
        dropdownNotifyFunctionName: '',
        conflictingValuesModalFunctionName: '',
        displayRowErrors: false,
        errorObjectFieldName: '',
        errorColumnToCheck: '',
    },
    nestedTableProperties: undefined,
    handlers: undefined,
    associatedFilters: undefined,
    datasource: [],
    component: {
        id: undefined,
    },
};

export default TableNew;
