import { Autocomplete, Button, ButtonGroup, Checkbox, Form, Text, TextField } from '@shopify/polaris';
import { CancelMinor, SendMajor } from '@shopify/polaris-icons';
import { useCallback, useEffect, useState } from 'react';
import { checkboxCss, statusOptions } from '../utils/constants.jsx';

export default function ProductForm({ product, collectionsData, onSubmit, onCancel, setToastMessage, setToastError, setToastActive }) {
    const [selectedStatusOptions, setSelectedStatusOptions] = useState([product.status]);
    const [collections, setCollections] = useState([]);
    const [selectedCollections, setSelectedCollections] = useState([]);
    const [inputStatusValue, setInputStatusValue] = useState(product.status);
    const [skuError, setSkuError] = useState(null);
    const [trackInventory, setTrackInventory] = useState(product.variants.edges[0]?.node.inventoryItem?.tracked || false);
    const[trackInventoryError, setTrackInventoryError] = useState(null);

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
    }, []);

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
        }

        setFormData({ ...formData, [field]: newValue });

        if (field === 'inventoryQuantity' || field === 'sku') {
            const inventoryQty = field === 'inventoryQuantity' ? parseInt(newValue) || 0 : parseInt(formData.inventoryQuantity) || 0;
            const skuValue = field === 'sku' ? newValue : formData.sku;

            if (inventoryQty !== 0 && !skuValue) {
                setSkuError("SKU is required when inventory quantity is not 0");
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

            setSelectedStatusOptions(selected);
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
            setToastMessage("Invalid inventory quantity");
            setToastError(true);
            setToastActive(true);
            return;
        }

        if (inventoryQty !== 0 && !formData.sku) {
            setSkuError("SKU is required when inventory quantity is not 0");
            setToastMessage("SKU is required when inventory quantity is not 0");
            setToastError(true);
            setToastActive(true);
            return;
        }

        if (inventoryQty !== 0 && !trackInventory) {
            setTrackInventoryError("Track inventory must be enabled to update stock");
          
            return;
        }

        const productId = product.id.split("/").pop();
        const variantId = product.variants.edges[0]?.node.id.split("/").pop();
        const inventoryItemId = formData.inventoryItemId.split("/").pop();

        setLoading(true);

        try {
            await onSubmit({
                product: {
                    id: productId,
                    title: formData.title,
                    handle: formData.slug,
                    variants: [{
                        id: variantId,
                        price: parseFloat(formData.salePrice) || 0,
                        sku: formData.sku,
                        compare_at_price: parseFloat(formData.price) || 0,
                        inventory_management: trackInventory ? 'shopify' : null
                    }],
                    tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : [],
                    status: formData.status.toLowerCase()
                },
                inventory: trackInventory ? {
                    inventoryItemId: inventoryItemId,
                    available: inventoryQty,
                    locationId: "83114426690",
                    sku: formData.sku
                } : null,
                collections: selectedCollections.length ? selectedCollections.map(collection => collection.id) : [],
            });
        } catch (error) {
            setToastMessage(error.message || "An error occurred while updating");
            setToastError(true);
            setToastActive(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ width: '100%', padding: '1rem' }}>
            <Form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', gap: '3rem', width: '100%', marginBottom: '2rem' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <Text as="p" fontWeight="bold">QUICK EDIT</Text>
                        <TextField
                            label="Title"
                            type="text"
                            value={formData.title}
                            onChange={handleChange('title')}
                            fullWidth
                        />
                        <TextField
                            label="Slug"
                            type="text"
                            value={formData.slug}
                            onChange={handleChange('slug')}
                            fullWidth
                        />
                        <Autocomplete
                            options={statusOptions}
                            selected={selectedStatusOptions}
                            onSelect={updateStatusSelection}
                            textField={statusTextField}
                        />
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

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <Text as="p" fontWeight="bold">Product Data</Text>
                        <TextField
                            label="SKU *"
                            type="text"
                            value={formData.sku}
                            onChange={handleChange('sku')}
                            required
                            error={skuError}
                            fullWidth
                        />
                        <TextField
                            label="Price"
                            type="number"
                            value={formData.price}
                            onChange={handleChange('price')}
                            fullWidth
                        />
                        <TextField
                            label="Sale Price"
                            type="number"
                            value={formData.salePrice}
                            onChange={handleChange('salePrice')}
                            fullWidth
                        />
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem' }}>
                            <TextField
                                label="Stock"
                                type="number"
                                value={formData.inventoryQuantity}
                                onChange={handleChange('inventoryQuantity')}
                                fullWidth
                            />
                            <Checkbox
                                label="Track Inventory"
                                checked={trackInventory}
                                onChange={(checked) => setTrackInventory(checked)}
                                error={trackInventoryError}
                            />
                        </div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <Text as='p'>Product Category</Text>
                        <div style={checkboxCss}>
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