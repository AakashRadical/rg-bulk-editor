export const resourceName = {
    singular: 'product',
    plural: 'products',
};

export const heading = [
    { title: 'Image' },
    { title: 'Name' },
    { title: 'Status' },
    { title: 'Stock' },
    { title: 'Price' },
    { title: 'Category' },
];

export const statusOptions = [
    {label: 'Active', value: 'Active'},
    {label: 'Draft', value: 'Draft'},
    {label: 'Archived', value: 'Archived'},
];

export const sortOptions = [
    { label: "Title", value: "title asc", directionLabel: 'A-Z' },
    { label: "Title", value: "title desc", directionLabel: 'Z-A' },
    { label: "Created", value: "created asc", directionLabel: 'Oldest First' },
    { label: "Created", value: "created desc", directionLabel: 'Newest First' },
    { label: "Updated", value: "update asc", directionLabel: 'Oldest First' },
    { label: "Updated", value: "update desc", directionLabel: 'Newest First' },
    { label: "Inventory", value: "inventory asc", directionLabel: 'Low to High' },
    { label: "Inventory", value: "inventory desc", directionLabel: 'High to Low' },
    { label: "Collection", value: "collection asc", directionLabel: 'A-Z' },
    { label: "Collection", value: "collection desc", directionLabel: 'Z-A' },
];

// CSS Styling

export const btn = {
    position: 'relative',
    left: '9.6rem',
    bottom: '0.8rem',
    width: '100%',
};

export const checkboxCss = {
    border: '1px solid #ccc',
    padding: '0.5rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '13rem',
    overflowY: 'auto',
    borderRadius: '6px',
};

export const spinnerCss = {
    display: 'flex',
    justifyContent: 'center',
    padding: '2rem'
};

export const paginatedButtonCss = {
    position: "sticky",
    bottom: 0,
    left: 0,
    width: "100%",
    backgroundColor: "#F7F7F7",
    display: "flex",
    justifyContent: "center",
    padding: "0.5rem 0",
    zIndex: 1000,
    borderTop: "1px solid #DDE0E4",
    borderBottom: "1px solid #DDE0E4",
    borderBottomLeftRadius: "8px",
    borderBottomRightRadius: "8px",
};