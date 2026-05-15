import inventoryApi from './inventoryApi';

const inventoryService = {
  // Stock Overview
  getCurrentStock: () => inventoryApi.get('stock/current'),
  getDamagedStock: () => inventoryApi.get('stock/damaged'),
  getStockLedger: () => inventoryApi.get('inventory/ledger'),
  getStockHistory: (itemId) => inventoryApi.get(`inventory/history/${itemId}`),
  getLowStockReport: () => inventoryApi.get('inventory/low-stock'),
  getStockAdjustments: () => inventoryApi.get('stock-adjustments'),
  
  // Material Requests
  getMaterialRequests: () => inventoryApi.get('bridge/material-requests'),
  getMaterialRequestDetails: (id) => inventoryApi.get(`bridge/material-requests/${id}`),
  submitMaterialRequest: (data) => inventoryApi.post('projects/material-request', data),
  addItemsToMRBulk: (id, items) => inventoryApi.post(`projects/material-request/${id}/add-items-bulk`, { items }),
  routeMaterialRequestLine: (data) => inventoryApi.post('projects/material-request/route-line', data),
  routeMaterialRequestBulk: (data) => inventoryApi.post('projects/material-request/bulk-route', data),
  amendStoreShortageLine: (data) => inventoryApi.post('amendStoreShortageLine', data),
  
  // Purchase Operations
  getVendors: () => inventoryApi.get('bridge/vendors'),
  createVendor: (data) => inventoryApi.post('purchase/vendors', data),
  updateVendor: (id, data) => inventoryApi.put(`vendors/${id}`, data),
  deleteVendor: (id) => inventoryApi.delete(`vendors/${id}`),
  getPurchaseRequests: () => inventoryApi.get('purchase/requests'),
  getPurchasePlanning: (mode) => inventoryApi.get('inventory/purchase-planning', { params: { mode } }),
  getIndividualPurchaseRequests: () => inventoryApi.get('inventory/purchase-requests/individual'),
  generatePurchaseOrders: (data) => inventoryApi.post('generatePurchaseOrders', data),
  getPurchaseOrders: () => inventoryApi.get('purchase/orders'),
  getPurchaseOrderDetails: (poId) => inventoryApi.get(`purchase/orders/${poId}`),
  submitPOForApproval: (purchaseOrderId) => inventoryApi.post('submitPurchaseOrderForApproval', { purchaseOrderId }),
  reviewPO: (purchaseOrderIdOrData, decision, adminRemarks) => {
    if (typeof purchaseOrderIdOrData === 'object' && purchaseOrderIdOrData !== null) {
      return inventoryApi.post('reviewPurchaseOrder', purchaseOrderIdOrData);
    }
    return inventoryApi.post('reviewPurchaseOrder', {
      purchaseOrderId: purchaseOrderIdOrData,
      decision,
      adminRemarks,
    });
  },
  markPOPlaced: (data) => inventoryApi.post('markPurchaseOrderPlaced', data),
  receivePO: (data) => inventoryApi.post('receivePurchaseOrderLines', data),
  downloadPurchaseOrderPDF: (poId) => inventoryApi.get(`purchase/orders/${poId}/pdf`, { responseType: 'blob' }),
  
  // Stock Adjustments
  submitStockAdjustment: (data) => inventoryApi.post('submitStockAdjustment', data),
  approveStockAdjustment: (batchIdOrData, adminRemarks) => {
    if (typeof batchIdOrData === 'object' && batchIdOrData !== null) {
      return inventoryApi.post('approveStockAdjustment', batchIdOrData);
    }
    return inventoryApi.post('approveStockAdjustment', { batchId: batchIdOrData, adminRemarks });
  },
  rejectStockAdjustment: (batchIdOrData, adminRemarks) => {
    if (typeof batchIdOrData === 'object' && batchIdOrData !== null) {
      return inventoryApi.post('rejectStockAdjustment', batchIdOrData);
    }
    return inventoryApi.post('rejectStockAdjustment', { batchId: batchIdOrData, adminRemarks });
  },
  
  // Master Data — Classifications
  createClassification: (data) => inventoryApi.post('admin/classifications', data),
  updateClassification: (id, data) => inventoryApi.put(`classifications/${id}`, data),
  deleteClassification: (id) => inventoryApi.delete(`classifications/${id}`),

  // Master Data — Items
  createItem: (data) => inventoryApi.post('admin/items', data),
  updateItem: (id, data) => inventoryApi.put(`items/${id}`, data),
  deleteItem: (id) => inventoryApi.delete(`items/${id}`),
  bulkImportItems: (items) => inventoryApi.post('admin/items/bulk-import', { items }),

  // Master Data — Locations
  createLocation: (data) => inventoryApi.post('admin/locations', data),
  updateLocation: (id, data) => inventoryApi.put(`stock-locations/${id}`, data),
  deleteLocation: (id) => inventoryApi.delete(`stock-locations/${id}`),

  // Master Data — Vendor SKU Mappings
  getVendorSkuMappings: () => inventoryApi.get('vendor-sku-mappings'),
  getItemSkuMappings: (itemId) => inventoryApi.get(`vendor-sku-mappings/item/${itemId}`),
  createVendorSkuMapping: (data) => inventoryApi.post('vendor-sku-mappings', data),
  deleteVendorSkuMapping: (id) => inventoryApi.delete(`vendor-sku-mappings/${id}`),
  
  // Master Data (for dropdowns)
  getItems: () => inventoryApi.get('inventory'),
  getClassifications: () => inventoryApi.get('bridge/classifications'),
  getLocations: () => inventoryApi.get('bridge/stock-locations'),
  getProjects: () => inventoryApi.get('bridge/projects'),
  getEligibleProjectReturnProjects: () => inventoryApi.get('project-returns/eligible-projects'),
  getProjectReturnableItems: (projectId) => inventoryApi.get(`project-returns/eligible-items/${projectId}`),
  getProjectReturns: () => inventoryApi.get('project-returns'),
  submitProjectReturn: (data) => inventoryApi.post('project-returns', data),
  approveProjectReturn: (id, reviewRemarks) => inventoryApi.post(`project-returns/${id}/approve`, { reviewRemarks }),
  rejectProjectReturn: (id, reviewRemarks) => inventoryApi.post(`project-returns/${id}/reject`, { reviewRemarks }),
  
  // Store / Dispatch
  getStoreRequests: () => inventoryApi.get('store/requests'),
  getDispatches: () => inventoryApi.get('bridge/dispatches'),
  dispatchStoreRequest: (data) => inventoryApi.post('store/dispatch', data),
  acknowledgeDispatch: (data) => inventoryApi.post('acknowledgeDispatch', data),
  confirmDispatch: (dispatchId, engineerRemarks, receiptAction = 'accept') =>
    inventoryApi.post('acknowledgeDispatch', { dispatchId, engineerRemarks, receiptAction }),
  confirmStoreRequest: (data) => inventoryApi.post('store/confirm', data),
  transferStock: (data) => inventoryApi.post('stock/transfer', data),
  
  // Audit Logs
  getAuditLogs: (params = {}) => inventoryApi.get('audit-logs', { params }),

  // Dashboard
  getDashboardStats: () => inventoryApi.get('dashboard-stats'),
};

export default inventoryService;
