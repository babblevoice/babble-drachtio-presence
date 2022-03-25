


const uacstore = require( "./uacstore.js" )


class subscription {
  /**
  Instantiates the subscription class.
  @constructor
  @param { Request } req - the initial request
  @param { Response } res - srf response
  @param { object } options - our options object
  @param { function } options.userlookup - async user lookup function - required
  @param { boolean } [ options.proxy = true ] - true = respond with 407 otherwise 401
  @param { number } [ options.authtimeout = 100000 ] - timeout in mS
  
  */
  constructor( req, res, options = {} ) {

  }

}

module.exports = subscription
