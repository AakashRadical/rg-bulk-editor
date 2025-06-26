import { Autocomplete, Button, ButtonGroup, Checkbox, Form, Select, Text, TextField } from '@shopify/polaris';
import { CancelMinor, SendMajor } from '@shopify/polaris-icons';
import { useCallback, useContext, useEffect, useState } from 'react';
import { checkboxCss, statusOptions } from '../utils/constants.jsx';
import { ProductContext } from '../context/ProductContext.jsx';

export default function ProductForm({ product, collectionsData, onSubmit, onCancel, setToastMessage, setToastError, setToastActive }) {
    const [selectedStatusText, setSelectedStatusText] = useState([product.status]);
    const [collections, setCollections] = useState([]);
    const [selectedCollections, setSelectedCollections] = useState([]);
    const [inputStatusValue, setInputStatusValue] = useState(product.status);
    const [skuError, setSkuError] = useState(null);
    const [trackInventory, setTrackInventory] = useState(true); // Always true for inventory updates
    const [trackInventoryError, setTrackInventoryError] = useState(null);
    const [inventoryLocationError, setInventoryLocationError] = useState(null);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const { fetchedLocations } = useContext(ProductContext);

    // Initialize default location
    useEffect(() => {
        if (fetchedLocations && fetchedLocations.length > 0) {
            setSelectedLocation(fetchedLocations[0].id);
        }
    }, [fetchedLocations]);

    const [formData, setFormData] = useState({
        title: product.title || "-",
        slug: product.handle || "-",
        status: product.status || "-",
        sku: product.variants.edges[0]?.node.sku || "",
        salePrice: product.variants.edges[0]?.node.price || "",
        price: product.variants.edges[0]?.node.compareAtPrice || "",
        tags: Array.isArray(product.tags) ? product.tags.join(', ') : "",
        inventoryQuantity: product.variants.edges[0]?.node.inventoryQuantity?.toString() || "0",
        inventoryItemId: product.variants.edges[0]?.node.inventoryItem.id || "",
        collections: product.collections.edges.map(edge => edge.node.id) || []
    });

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchCollections();
    }, [collectionsData]);

    const fetchCollections = async () => {
        try {
            const formattedCollections = collectionsData.map(edge => ({
                id: edge.node.id,
                title: edge.node.title,
                handle: edge.node.handle
            }));
            setCollections(formattedCollections);

            const initialSelected = formattedCollections.filter(collection =>
                formData.collections.includes(collection.id)
            );
            setSelectedCollections(initialSelected);
        } catch (error) {
            console.error('Error fetching collections:', error);
        }
    };

    const handleChange = (field) => (value) => {
        let newValue = value === null || value === undefined ? '' : String(value);
        if (field === 'inventoryQuantity') {
            if (formData.inventoryQuantity === '0' && /^[1-9]|-/.test(newValue)) {
                newValue = newValue;
            } else if (newValue === '') {
                newValue = '0';
            } else if (isNaN(parseInt(newValue)) && newValue !== '-' && newValue !== '-0.') {
                newValue = '0';
            }
            // Automatically enable Track Inventory and clear errors for any quantity
            setTrackInventory(true);
            setTrackInventoryError(null);
            setInventoryLocationError(null);
        }

        setFormData({ ...formData, [field]: newValue });

        if (field === 'inventoryQuantity' || field === 'sku') {
            const inventoryQty = field === 'inventoryQuantity' ? parseInt(newValue) || 0 : parseInt(formData.inventoryQuantity) || 0;
            const skuValue = field === 'sku' ? newValue : formData.sku;

            if (trackInventory && inventoryQty !== 0 && !skuValue) {
                setSkuError("SKU is required when inventory quantity is not 0!");
            } else {
                setSkuError(null);
            }
        }
    };

    const handleCollectionToggle = (collectionId) => {
        setSelectedCollections(prev => {
            const isSelected = prev.find(c => c.id === collectionId);
            if (isSelected) {
                return prev.filter(c => c.id !== collectionId);
            } else {
                const collection = collections.find(c => c.id === collectionId);
                return [...prev, collection];
            }
        });
    };

    const updateStatusText = useCallback(
        (value) => setInputStatusValue(value),
        [],
    );

    const statusTextField = (
        <Autocomplete.TextField
            onChange={updateStatusText}
            label="Status"
            value={inputStatusValue}
            placeholder="Set the status"
            autoComplete="false"
        />
    );

    const updateStatusSelection = useCallback(
        (selected) => {
            const selectedValue = selected.map((selectedValue) => {
                const matchedOption = statusOptions.find((option) => {
                    return option.value === selectedValue;
                });
                return matchedOption ? matchedOption.label : '';
            });

            setSelectedStatusText(selected);
            setInputStatusValue(selectedValue[0] || '');
            setFormData(prev => ({ ...prev, status: selected[0] || '' }));
        },
        [],
    );

    const handleSubmit = async (event) => {
        event.preventDefault();

        const finalInventoryQuantity = formData.inventoryQuantity === '' || formData.inventoryQuantity === '-' ? '0' : formData.inventoryQuantity;
        const inventoryQty = parseInt(finalInventoryQuantity);

        if (isNaN(inventoryQty)) {
            setToastMessage("Invalid inventory quantity!");
            setToastError(true);
            setToastActive(true);
            return;
        }

        if (trackInventory && inventoryQty !== 0 && !formData.sku) {
            setSkuError("SKU is required when inventory quantity is not 0!");
            return;
        }

        if (trackInventory && !selectedLocation) {
            setInventoryLocationError("Please select an inventory location!");
            return;
        }

        const productId = product.id.split("/").pop();
        const variantId = product.variants.edges[0]?.node.id.split("/").pop();
        const inventoryItemId = formData.inventoryItemId.split("/").pop();

        setLoading(true);

        try {
            // Include inventory fields for any quantity
            const variantData = {
                id: variantId,
                price: parseFloat(formData.salePrice) || 0,
                compare_at_price: parseFloat(formData.price) || 0,
                inventory_management: trackInventory ? 'shopify' : null,
                inventory_quantity: inventoryQty,
                location_id: trackInventory ? selectedLocation.split('/').pop() : null,
                inventory_item_id: trackInventory ? inventoryItemId : null,
            };

            // Include SKU only when inventory is tracked
            if (trackInventory) {
                variantData.sku = formData.sku;
            }

            await onSubmit({
                product: {
                    id: productId,
                    title: formData.title,
                    handle: formData.slug,
                    variants: [variantData],
                    tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : [],
                    status: formData.status.toLowerCase(),
                },
                inventory: trackInventory ? {
                    inventoryItemId: inventoryItemId,
                    available: inventoryQty,
                    locationId: selectedLocation.split('/').pop(),
                    sku: formData.sku
                } : null,
                collections: selectedCollections.length ? selectedCollections.map(collection => collection.id) : [],
            });
        } catch (error) {
            setToastMessage(error.message || "An error occurred while updating!");
            setToastError(true);
            setToastActive(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            width: '100%',
            padding: '2rem',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            maxWidth: '1200px',
            margin: '0 auto'
        }}>
            <Form onSubmit={handleSubmit}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '2rem',
                    marginBottom: '2rem'
                }}>
                    {/* Quick Edit Section */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.5rem',
                        padding: '1rem',
                        background: '#f9fafb',
                        borderRadius: '4px'
                    }}>
                        <Text as="p" fontWeight="bold" variant="headingMd">QUICK EDIT</Text>
                        <div style={{ position: 'relative' }}>
                            <TextField
                                label="Title"
                                type="text"
                                value={formData.title}
                                onChange={handleChange('title')}
                                fullWidth
                            />
                        </div>
                        <div style={{ position: 'relative' }}>
                            <TextField
                                label="Slug"
                                type="text"
                                value={formData.slug}
                                onChange={handleChange('slug')}
                                fullWidth
                            />
                        </div>
                        <div style={{ position: 'relative' }}>
                            <Autocomplete
                                options={statusOptions}
                                selected={selectedStatusText}
                                onSelect={updateStatusSelection}
                                textField={statusTextField}
                            />
                        </div>
                        <div style={{ position: 'relative' }}>
                            <TextField
                                label="Product Tags"
                                type="text"
                                value={formData.tags}
                                onChange={handleChange('tags')}
                                helpText='Separate tags with commas'
                                multiline
                                fullWidth
                            />
                        </div>
                    </div>

                    {/* Product Data Section */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.5rem',
                        padding: '1rem',
                        background: '#f9fafb',
                        borderRadius: '4px'
                    }}>
                        <Text as="p" fontWeight="bold" variant="headingMd">Product Data</Text>
                        <div style={{ position: 'relative' }}>
                            <TextField
                                label="SKU"
                                type="text"
                                value={formData.sku}
                                onChange={handleChange('sku')}
                                required={trackInventory && parseInt(formData.inventoryQuantity) !== 0}
                                error={skuError}
                                fullWidth
                            />
                        </div>
                        <div style={{ position: 'relative' }}>
                            <TextField
                                label="Price"
                                type="number"
                                value={formData.price}
                                onChange={handleChange('price')}
                                fullWidth
                            />
                        </div>
                        <div style={{ position: 'relative' }}>
                            <TextField
                                label="Sale Price"
                                type="number"
                                value={formData.salePrice}
                                onChange={handleChange('salePrice')}
                                fullWidth
                            />
                        </div>
                        <div style={{ position: 'relative' }}>
                            <TextField
                                label="Stock"
                                type="number"
                                value={formData.inventoryQuantity}
                                onChange={handleChange('inventoryQuantity')}
                                fullWidth
                                helpText="Enter the inventory quantity"
                            />
                        </div>
                    </div>

                    {/* Product Category Section */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.5rem',
                        padding: '1rem',
                        background: '#f9fafb',
                        borderRadius: '4px'
                    }}>
                        <Text as="p" fontWeight="bold" variant="headingMd">Product Category</Text>
                        <div style={{
                            ...checkboxCss,
                            maxHeight: '300px',
                            overflowY: 'auto',
                            padding: '0.5rem',
                            background: '#fff',
                            border: '1px solid #dfe3e8',
                            borderRadius: '4px'
                        }}>
                            {collections.map((collection) => (
                                <Checkbox
                                    key={collection.id}
                                    label={collection.title}
                                    checked={selectedCollections.some(c => c.id === collection.id)}
                                    onChange={() => handleCollectionToggle(collection.id)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
                <ButtonGroup>
                    <Button icon={SendMajor} loading={loading} primary submit>Update</Button>
                    <Button icon={CancelMinor} onClick={onCancel} monochrome>Cancel</Button>
                </ButtonGroup>
            </Form>
        </div>
    );
}