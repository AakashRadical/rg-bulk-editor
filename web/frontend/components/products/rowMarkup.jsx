import { Badge, Icon, IndexTable, Thumbnail, Tooltip } from "@shopify/polaris";
import { EditMinor, ImageMajor, ViewMinor } from '@shopify/polaris-icons';
import React, { useCallback, useState } from "react";
import './style.css';
import Update from "./update.jsx";

export default function RowMarkup({ product, domain, index, collections, selected, onSelect, updateProduct }) {
    const [open, setOpen] = useState(false);

    const title = product?.title || "-";
    const status = product?.status || "-";
    const variant = product?.variants?.edges?.[0]?.node;
    const trackInventory = variant?.inventoryItem?.tracked || false;
    const stock = trackInventory ? (variant?.inventoryQuantity || 0) : "-";
    const price = variant?.price || "-";
    const collection = product?.collections?.edges
        ?.map((collect) => collect.node.title)
        .join(", ") || "-";
    const imageUrl = product?.featuredImage?.originalSrc || "No Image Available";
    const handle = product?.handle;

    let stat = null;
    if (status === "ACTIVE") {
        stat = "success";
    } else if (status === "DRAFT") {
        stat = "info";
    } else if (status === "ARCHIVED") {
        stat = null;
    }

    const handleToggle = useCallback(() => {
        setOpen((prev) => !prev);
        onSelect();
    }, [onSelect]);

    return (
        <>
            <IndexTable.Row
                id={product.id}
                key={product.id}
                selected={selected}
                position={index}
                aria-expanded={open}
                onClick={handleToggle}
                aria-controls="basic-collapsible"
            >
                <IndexTable.Cell>
                    {imageUrl !== "No Image Available" ? (
                        <Thumbnail source={imageUrl} alt={`${title} thumbnail`} size="small" />
                    ) : (
                        <div className="defaultIcon">
                            <Icon source={ImageMajor} tone="base" />
                        </div>
                    )}
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <div className="title">
                        {title}
                        <div className="viewIcon">
                            <Tooltip content="Preview on Online Store">
                                <a
                                    className="viewBtn"
                                    href={`https://${domain}/products/${handle}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Preview on Online Store"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <Icon source={ViewMinor} />
                                </a>
                            </Tooltip>
                            <Tooltip content="Quick edit">
                                <a
                                    className="editBtn"
                                    aria-expanded={open}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleToggle();
                                    }}
                                    aria-controls="basic-collapsible"
                                >
                                    <Icon source={EditMinor} />
                                </a>
                            </Tooltip>
                        </div>
                    </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Badge status={stat}>
                        {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
                    </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>{stock}</IndexTable.Cell>
                <IndexTable.Cell>{price}</IndexTable.Cell>
                <IndexTable.Cell>{collection}</IndexTable.Cell>
            </IndexTable.Row>
            <tr>
                <td colSpan="7">
                    <Update
                        open={open}
                        product={product}
                        collections={collections}
                        handleToggle={handleToggle}
                        updateProduct={updateProduct}
                    />
                </td>
            </tr>
        </>
    );
}