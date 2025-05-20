import { Collapsible, LegacyCard, LegacyStack, Toast } from '@shopify/polaris';
import { useCallback, useState } from 'react';
import { btn } from '../utils/constants.jsx';
import ProductForm from './form.jsx';
import './style.css';

export default function Update({ open, product, collections, handleToggle }) {
    const [toastActive, setToastActive] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [toastError, setToastError] = useState(false);

    const toggleToastActive = useCallback(() => setToastActive((toastActive) => !toastActive), []);

    const toastMarkup = toastActive ? (
        <Toast content={toastMessage} error={toastError} onDismiss={toggleToastActive} />
    ) : null;

    const handleSubmit = async (updatedData) => {
        const productId = product.id.split("/").pop();
        try {
            // Update product details
            const productResponse = await fetch(`/api/products/${productId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    product: {
                        ...updatedData.product,
                        // Remove collections from product update
                        collections: undefined
                    }
                }),
            });
    
            if (!productResponse.ok) {
                throw new Error(`Error updating product: ${productResponse.statusText}`);
            }
    
            // Update collections if they're provided
            if (updatedData.collections !== undefined) {
                const collectionsResponse = await fetch(`/api/product-collections/${productId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        collections: updatedData.collections // Empty array when no collections selected
                    }),
                });
            
                if (!collectionsResponse.ok) {
                    const errorData = await collectionsResponse.json();
                    throw new Error(errorData.error || 'Error updating collections');
                }
            }
    
            // Update inventory level if inventory data is provided
            // Update inventory level if inventory data exists
            if (updatedData.inventory && updatedData.inventory.inventoryItemId) {
                // Clean the inventory item ID - remove 'gid://shopify/InventoryItem/' prefix if present
                const cleanInventoryItemId = updatedData.inventory.inventoryItemId.split('/').pop();
                
                console.log('Sending inventory update request:', {
                    inventoryItemId: cleanInventoryItemId,
                    available: updatedData.inventory.available,
                    locationId: updatedData.inventory.locationId
                });

                const inventoryResponse = await fetch(`/api/inventorylevel/${cleanInventoryItemId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        available: parseInt(updatedData.inventory.available),
                        locationId: updatedData.inventory.locationId
                    }),
                });

                const inventoryText = await inventoryResponse.text(); // First get the raw response text
                console.log('Raw inventory response:', inventoryText);

                let inventoryData;
                try {
                    inventoryData = inventoryText ? JSON.parse(inventoryText) : {};
                } catch (e) {
                    console.error('Error parsing inventory response:', e);
                    throw new Error('Invalid response from inventory update');
                }

                if (!inventoryResponse.ok) {
                    throw new Error(inventoryData.error || 'Error updating inventory');
                }
            }
    
            setToastMessage("Product updated successfully");
            setToastError(false);
            setToastActive(true);
            handleToggle();
    
        } catch (error) {
            console.error('Update error:', error);
            setToastMessage(error.message || "An error occurred while updating");
            setToastError(true);
            setToastActive(true);
        }
    };
    

    return (
        <div style={btn}>
            <LegacyStack>
                <Collapsible
                    open={open}
                    id="basic-collapsible"
                    transition={{ duration: '500ms', timingFunction: 'ease-in-out' }}
                    expandOnPrint
                >
                    <div style={{ marginTop: '1rem' }}>
                        <LegacyCard sectioned>
                            <ProductForm
                                product={product}
                                collectionsData={collections}
                                onSubmit={handleSubmit}
                                onCancel={handleToggle}
                            />
                        </LegacyCard>
                    </div>
                </Collapsible>
            </LegacyStack>
            {toastMarkup}
        </div>
    );
}