# babble-drachtio-presence

A presence agent which will work with other modules in this family.

Presence is a little more tricky as different clients use slightly different mechanisms for advertising their state. For example, Zoiper5 uses SIP PUBLISH to announce its state. If you want to discover if a Zoiper5 client has DND enabled (and be alerted to when it is triggered) then we have to listen out for PUBLISH events. Polycom phones (a VVX 101 for example) require us to subscribe to the phone and then listen for a NOTIFY.

With Zoiper they make use of a field which the RFC states SHOULD NOT be used to interpret the state of the phone. We do use that field as it is not a MUST NOT and it is the only way to discover the state of a phone.

This can lead a better system as we can report on how many phones are in a state to receive a phone call (for a queue for example) and also reject calls for phones faster as we already know the state of the phone is not suitable.

We use the Registrar object to listen for registration events so that we can SUBSCRIBE to the phone after the phone registers. We also listen for PUBLISH events.

I have looked at the documents we are provided with by clients and they are
* application/pidf+xml
* application/xpidf+xml (although I am not sure if this is a Polycom specific thing)
* application/dialog-info+xml
* application/simple-message-summary - [RFC 3842](https://tools.ietf.org/html/rfc3842)
* application/watcherinfo+xml - [RFC 3842](https://tools.ietf.org/html/rfc3842) - I am not oing to support this just yet

We can use presence information and our own tracking of calls ourselves to publish information dialog information via NOTIFY to all SUBSCRIPTIONS clients agree with us.

## Structure

babble-drachtio-presence handles SUBSCRIPTIONs and renewals. It also listen out for PUBLISH events.

### Subscription

babble-drachtio-presence emits a "subscribe" event with a contenttype of "application/simple-message-summary". The structure supplied is

```json
{
  "id": 123,
  "contenttype": "application/simple-message-summary",
  "entity": "1000@bling.babblevoice.com",
  "expires": 60
}
```

* id references the dialog id, this should be used if a responce is generated specific to this event.
* contenttype contains the content type which the subscription has asked for
  * "application/simple-message-summary": voicemail
  * "application/pidf+xml": status
  * "application/xpidf+xml": status (Polycom only?)
  * "application/dialog-info+xml": dialogs
* entity is what the subscriber is subscribing to
* expires...

This is only fired when a new subscription is generated. When existing subscriptions are refreshed this is not fired. To conform to RFC these events must be responded to. Otherwise the initial NOTIFY which is a requirement is not sent. It is only fired to query the initial status. If we already have a status for that event type it will not be fired.

### Voicemail

Once the subscriptions event for voicemail has been emitted (contenttype: "application/simple-message-summary"). It **must** be answered with a voicemail event. When voicemail has been updated this event is also used - but with no ref id added to it.

```json
{
  "ref": 123,
  "entity": "1000@bling.babblevoice.com",
  "newcount": 0,
  "oldcount": 0,
  "newurgent": 0,
  "oldurgent": 0
}
```

If you create your own voicemail system, then you also have to set the option.dummyvoicemail = false. Dummyvoicemail can also be used as a reference for what needs sending.

## Refs

* Session Initiation Protocol (SIP) - [RFC 3261](https://tools.ietf.org/html/rfc3261)
* Session Initiation Protocol (SIP)-Specific Event Notification (obsoleted by 6665) - [RFC 3265](https://tools.ietf.org/html/rfc3265)
* Presence Information Data Format (PIDF) [RFC 3863](https://tools.ietf.org/html/rfc3863)
* An INVITE-Initiated Dialog Event Package for the Session Initiation Protocol (SIP) - [RFC 4235](https://tools.ietf.org/html/rfc4235)
* SIP-Specific Event Notification - [RFC 6665](https://tools.ietf.org/html/rfc6665)
* SIP Message Waiting [RFC 3842](https://tools.ietf.org/html/rfc3842)
