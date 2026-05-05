import api from './api';

const inventoryService = {
  // Stock Overview
  getCurrentStock: () => api.get('/inventory/stock/current'),
  getStockLedger: () => api.get('/inventory/stock/ledger'),
  
  // Material Requests
  getMaterialRequests: () => api.get('/inventory/material-requests'),
  getMaterialRequestDetails: (id) => api.get(`/inventory/material-requests/${id}`),
  submitMaterialRequest: (data) => api.post('/inventory/material-requests', data),
  routeMaterialRequestLine: (data) => api.post('/inventory/routeMaterialRequestLine', data),
  routeMaterialRequestBulk: (data) => api.post('/inventory/routeMaterialRequestBulk', data),
  
  // Purchase Operations
  getVendors: () => api.get('/inventory/vendors'),
  createVendor: (data) => api.post('/inventory/createVendor', data),
  getPurchaseRequests: () => api.get('/inventory/purchase/requests'),
  generatePurchaseOrders: (data) => api.post('/inventory/generatePurchaseOrders', data),
  getPurchaseOrders: () => api.get('/inventory/purchase/orders'),
  getPurchaseOrderDetails: (id) => api.get(`/inventory/purchase/orders/${id}`),
  submitPOForApproval: (id) => api.post('/inventory/submitPurchaseOrderForApproval', { purchaseOrderId: id }),
  reviewPO: (id, decision, remarks) => api.post('/inventory/reviewPurchaseOrder', { purchaseOrderId: id, decision, adminRemarks: remarks }),
  markPOPlaced: (data) => api.post('/inventory/markPurchaseOrderPlaced', data),
  receivePO: (data) => api.post('/inventory/receivePurchaseOrderLines', data),
  
  // Stock Adjustments / Reconciliation
  getStockAdjustments: () => api.get('/inventory/stock-adjustments'),
  submitStockAdjustment: (data) => api.post('/inventory/submitStockAdjustment', data),
  approveStockAdjustment: (id, remarks) => api.post('/inventory/approveStockAdjustment', { batchId: id, adminRemarks: remarks }),
  rejectStockAdjustment: (id, remarks) => api.post('/inventory/rejectStockAdjustment', { batchId: id, adminRemarks: remarks }),
  
  // Master Data
  createClassification: (data) => api.post('/inventory/createClassification', data),
  updateClassification: (data) => api.post('/inventory/updateClassification', data),
  createLocation: (data) => api.post('/inventory/createStockLocation', data),
  createItem: (data) => api.post('/inventory/createItem', data),
  importItems: (data) => api.post('/inventory/importItems', data),
  
  // Audit & Analytics
  getStockHistory: (itemCode) => api.get(`/inventory/stock/history${itemCode ? `?itemCode=${itemCode}` : ''}`),
  getLowStockReport: () => api.get('/inventory/reports/low-stock'),
  
  // Logistics
  transferStock: (data) => api.post('/inventory/transferStock', data),
  
  // Store / Dispatch
  getStoreRequests: () => api.get('/inventory/store/requests'),
  getDispatches: () => api.get('/inventory/dispatches'),
  confirmDispatch: (id, remarks) => api.post(`/inventory/dispatches/${id}/acknowledge`, { remarks }),

  // Master Data (for dropdowns)
  getItems: () => api.get('/inventory/items'),
  getClassifications: () => api.get('/inventory/classifications'),
  getLocations: () => api.get('/inventory/stock-locations'),
};

export default inventoryService;
