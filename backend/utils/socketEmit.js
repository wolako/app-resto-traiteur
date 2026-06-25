function notifyDriver(io, driverId, event, data)    { io.to(`driver_${driverId}`).emit(event, data); }
function notifyBusiness(io, businessId, event, data){ io.to(`business_${businessId}`).emit(event, data); }
function notifyClient(io, clientId, event, data)    { io.to(`client_${clientId}`).emit(event, data); }

module.exports = { notifyDriver, notifyBusiness, notifyClient };