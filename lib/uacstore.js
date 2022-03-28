/*
Our store of UAS subscriptions.
*/
const subscribeperregister = new Map()

/**
Add subscription to our store.
@param { object } register The subscription object.
@param { object } register.uuid The uuid of the register
*/
module.exports.set = ( register ) => {

  subscribeperregister.set( register.uuid, register )
}

module.exports.has = ( register ) => {
  return subscribeperregister.has( register.uuid )
}

/**
@param { object } register The subscription object.
@param { object } register.uuid The uuid of the register
*/
module.exports.get = ( register ) => {
  if( subscribeperregister.has( register.uuid ) ) {
    return subscribeperregister.get( register.uuid )
  }

  return false
}

/**
Delete subscription from our store.
@param { object } register The register object.
*/
module.exports.delete = ( register ) => {
  subscribeperregister.delete( register.uuid )
}

/*
For test purposes
*/
module.exports.stats = () => {
  return {
    "subscribeperregister": subscribeperregister.size
  }
}

/*
For test purposes
*/
module.exports.clear = () => {
  subscribeperregister.clear()
}