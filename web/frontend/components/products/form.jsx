import { Autocomplete, Button, ButtonGroup, Checkbox, Form, Text, TextField } from '@shopify/polaris';
import { CancelMinor, SendMajor } from '@shopify/polaris-icons';
import { useCallback, useEffect, useState } from 'react';
import { checkboxCss, statusOptions } from '../utils/constants.jsx';

export default function ProductForm({ product, collectionsData, onSubmit, onCancel }) {
    const [selectedStatusOptions, setSelectedStatusOptions] = useState([]);
    const [collections, setCollections] = useState([]);
    const [selectedCollections, setSelectedCollections] = useState([]);

    const [formData, setFormData] = useState({
        title: product.title,
        slug: product.handle,
        status: product.status,
        sku: product.variants.edges[0]?.node.sku || "-",
        salePrice: product.variants.edges[0]?.node.price || "-",
        price: product.variants.edges[0]?.node.compareAtPrice || "-",
        tags: product.tags.join(', ') || "",
        inventoryQuantity: product.variants.edges[0]?.node.inventoryQuantity || 0,
        inventoryItemId: product.variants.edges[0]?.node.inventoryItem.id || "",
        collections: product.collections.edges.map(edge => edge.node.id) || []
    });
    const [inputStatusValue, setInputStatusValue] = useState(formData.status);
    const [loading, setLoading] = useState(false);

    // Fetch collections on component mount
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

            // Set initially selected collections
            const initialSelected = formattedCollections.filter(collection =>
                formData.collections.includes(collection.id)
            );
            setSelectedCollections(initialSelected);
        } catch (error) {
            console.error('Error fetching collections:', error);
        }
    };

    const handleChange = (field) => (value) => {
        setFormData({ ...formData, [field]: value });
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
            autoComplete="off"
        />
    );

    const updateStatusSelection = useCallback(
        (selected) => {
            const selectedValue = selected.map((selectedItem) => {
                const matchedOption = statusOptions.find((option) => {
                    return option.value.match(selectedItem);
                });
                return matchedOption && matchedOption.label;
            });

            setSelectedStatusOptions(selected);
            setInputStatusValue(selectedValue[0] || '');
        },
        [statusOptions],
    );

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (isNaN(parseInt(formData.inventoryQuantity))) {
            setToastMessage("Invalid inventory quantity");
            setToastError(true);
            setToastActive(true);
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
                    }],
                    tags: formData.tags.split(',').map(tag => tag.trim()),
                    status: inputStatusValue.toLowerCase()
                },
                inventory: {
                    inventoryItemId: inventoryItemId,
                    available: parseInt(formData.inventoryQuantity),
                    locationId: "83114426690"
                },
                collections: selectedCollections.length ? selectedCollections.map(collection => collection.id) : [],
            });
        } catch (error) {
            console.error('Error updating product:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ width: '100%', padding: '1rem' }}>
            <Form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', gap: '3rem', width: '100%', marginBottom: '2rem' }}>
                    {/* Column 1: Quick Edit and Product Data */}
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

                    {/* Column 2: Product Data */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <Text as="p" fontWeight="bold">Product Data</Text>
                        <TextField
                            label="SKU"
                            type="text"
                            value={formData.sku}
                            onChange={handleChange('sku')}
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
                        <TextField
                            label="Stock"
                            type="number"
                            value={formData.inventoryQuantity}
                            onChange={handleChange('inventoryQuantity')}
                            fullWidth
                        />
                    </div>
                    {/* Column 3: Product Category */}
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
                    <Button icon={CancelMinor} onClick={onCancel} reset monochrome>Cancel</Button>
                </ButtonGroup>
            </Form>
        </div>
    );
}