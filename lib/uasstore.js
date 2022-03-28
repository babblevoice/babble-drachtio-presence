/*
Our store of UAS subscriptions.
*/

const bysubscribed = new Map()
const byfqcallid = new Map()

/**
Add subscription to our store.
@param { object } subscription The subscription object.
@param { object } subscription.uri Who the subscriber is subscribing to
@param { string } subscription.uri.user
@param { string } subscription.uri.host
*/
module.exports.set = ( subscription ) => {

  let user = subscription.uri.user + "@" + subscription.uri.host

  let ourusermap
  if( bysubscribed.has( user ) ) {
    ourusermap = bysubscribed.get( user )
  } else {
    ourusermap = new Map()
    bysubscribed.set( user, ourusermap )
  }

  ourusermap.set( subscription.uuid, subscription )
  byfqcallid.set( subscription._fqcallid, subscription )
}

/**
@param { string } user - user@host | fq id obtained from subscription.getexpires( req )
@return { Map } a map of subscriptions for this user
*/
module.exports.get = ( user ) => {
  if( bysubscribed.has( user ) ) {
    return bysubscribed.get( user )
  }

  if( byfqcallid.has( user ) ) {
    return byfqcallid.get( user )
  }

  return false
}

/**
Delete subscription from our store.
@param { object } subscription The subscription object.
*/
module.exports.delete = ( subscription ) => {
  let user = subscription.uri.user + "@" + subscription.uri.host
  if( !bysubscribed.has( user ) ) return

  let ourmap = bysubscribed.get( user )
  if( !ourmap.has( subscription.uuid ) ) return
  ourmap.delete( subscription.uuid )
  if( 0 === ourmap.size ) bysubscribed.delete( user )

  byfqcallid.delete( subscription._fqcallid )
}

/*
For test purposes
*/
module.exports.stats = () => {
  return {
    "bysubscribed": bysubscribed.size,
    "bycallid": byfqcallid.size
  }
}

/*
For test purposes
*/
module.exports.clear = () => {
  bysubscribed.clear()
  byfqcallid.clear()
}