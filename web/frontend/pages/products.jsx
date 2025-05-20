import {
    Frame, IndexFilters, IndexTable, LegacyCard, Pagination, Spinner, useSetIndexFiltersMode
} from "@shopify/polaris";
import React, { useContext } from "react";
import { ProductContext } from "../components/context/ProductContext.jsx";
import "../components/products/style.css";
import {
    heading, paginatedButtonCss, resourceName, sortOptions, spinnerCss
} from "../components/utils/constants.jsx";

export default function Products() {
    const { mode, setMode } = useSetIndexFiltersMode();
    const {
        tabs, filters, currentPage, totalPages, selected, queryValue, sortSelected, appliedFilters, rowMarkup,
        primaryAction, selectedResources, allResourcesSelected, isLoading, paginatedProducts,
        handlePreviousPage, handleNextPage, setSortSelected, setSelected, onCreateNewView,
        setQueryValue, onHandleCancel, handleSelectionChange, handleFiltersQueryChange, handleFiltersClearAll
    } = useContext(ProductContext);

    const isHeaderCheckboxSelected = allResourcesSelected || selectedResources.length > 0;

    const handleHeaderSelectionChange = (selected) => {
        if (selected) {
            handleSelectionChange(paginatedProducts.map(product => product.node.id));
        } else {
            handleSelectionChange([]);
        }
    };

    const dynamicHeadings = isHeaderCheckboxSelected
        ? [{ title: `${selectedResources.length} selected` }]
        : heading;

    const handleRowSelectionChange = (id) => {
        const newSelectedResources = selectedResources.includes(id)
            ? selectedResources.filter(resourceId => resourceId !== id)
            : [...selectedResources, id];

        handleSelectionChange(newSelectedResources);
    };

    return (
        <div style={{ padding: "1rem" }}>
            <Frame>
                <LegacyCard>
                    <IndexFilters
                        sortOptions={sortOptions}
                        sortSelected={sortSelected}
                        queryValue={queryValue}
                        queryPlaceholder="Searching in all"
                        onQueryChange={handleFiltersQueryChange}
                        onQueryClear={() => setQueryValue("")}
                        onSort={setSortSelected}
                        primaryAction={primaryAction}
                        cancelAction={{
                            onAction: onHandleCancel,
                            disabled: false,
                            loading: false,
                        }}
                        tabs={tabs}
                        selected={selected}
                        onSelect={setSelected}
                        canCreateNewView
                        onCreateNewView={onCreateNewView}
                        filters={filters}
                        appliedFilters={appliedFilters}
                        onClearAll={handleFiltersClearAll}
                        mode={mode}
                        setMode={setMode}
                    />
                    {isLoading ? (
                        <div style={spinnerCss}>
                            <Spinner accessibilityLabel="Loading products" size="large" />
                        </div>
                    ) : paginatedProducts?.length > 0 ? (
                        <>
                            <IndexTable
                                resourceName={resourceName}
                                itemCount={paginatedProducts?.length || 0}
                                selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
                                onSelectionChange={handleSelectionChange}
                                headings={dynamicHeadings}
                                onHeaderSelectionChange={handleHeaderSelectionChange}
                                pagination={{
                                    hasNext: currentPage < totalPages,
                                    hasPrevious: currentPage > 1,
                                    onNext: handleNextPage,
                                    onPrevious: handlePreviousPage,
                                }}
                                emptyState={null}
                            >
                                {rowMarkup.map((rowMarkup, index) => {
                                    return React.cloneElement(rowMarkup, {
                                        onSelect: () => handleRowSelectionChange(paginatedProducts[index].node.id),
                                        selected: selectedResources.includes(paginatedProducts[index].node.id)
                                    });
                                })}
                            </IndexTable>
                            <div style={paginatedButtonCss}>
                                <Pagination
                                    hasPrevious={currentPage > 1}
                                    onPrevious={() => handlePreviousPage()}
                                    hasNext={currentPage < totalPages}
                                    onNext={() => handleNextPage()}
                                    type="table"
                                    label={`${currentPage} of ${totalPages}`}
                                />
                            </div>
                        </>
                    ) : (
                        <div style={spinnerCss}>
                            <Spinner accessibilityLabel="Loading products" size="large" />
                        </div>
                    )}
                </LegacyCard>
            </Frame>
        </div>
    );
}