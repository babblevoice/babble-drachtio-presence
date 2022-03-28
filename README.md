# babble-drachtio-presence

Work in progress.

- [x] Voicemail
- [ ] Dialog
- [ ] Status
- [ ] Improve modularity of dosubscribe and test storage for leaks

A presence agent which will work with other modules in this family.

* A UAC can SUBSCRIBE to us; we then NOTIFY information to the phone (dialog/voicemail etc)
* We can SUBSCRIBE to a UAC (we are the UAS); we then receive NOTIFY on DND from the phone
* A client can PUBLISH to us - I am leaving this out for the moment until I see more support other than Zoiper - which has issues anyway

## Notes

Presence is a little more tricky as different clients use slightly different mechanisms for advertising their state. For example, Zoiper5 uses SIP PUBLISH to announce its state. If you want to discover if a Zoiper5 client has DND enabled (and be alerted to when it is triggered) then we have to listen out for PUBLISH events. Polycom phones (a VVX 101 for example) require us to subscribe to the phone and then listen for a NOTIFY.

With Zoiper they make use of a field which the RFC states SHOULD NOT be used to interpret the state of the phone. We do use that field as it is not a MUST NOT and it is the only way to discover the state of a phone.

This can lead a better system as we can report on how many phones are in a state to receive a phone call (for a queue for example) and also reject calls for phones faster as we already know the state of the phone is not suitable.

We use the Registrar object to listen for registration events so that we can SUBSCRIBE to the phone after the phone registers. We also listen for PUBLISH events.

I have looked at the documents we are provided with by clients and they are
* application/pidf+xml
* application/xpidf+xml (although I am not sure if this is a Polycom specific thing)
* application/dialog-info+xml
* application/simple-message-summary - [RFC 3842](https://tools.ietf.org/html/rfc3842)
* application/watcherinfo+xml - [RFC 3842](https://tools.ietf.org/html/rfc3842) - I am not going to support this just yet

We can use presence information and our own tracking of calls ourselves to publish information dialog information via NOTIFY to all SUBSCRIPTIONS clients agree with us.

### Status

Status is sent to us and sent to UACs as PIDF and XPIDF documents. We receive status documents from UACs and also understand if clients are registered or not (as well as other status information).

When we receive a register, we SUBSCRIBE to the UAC for PIDF to receive status.

A UAC can SUBSCRIBE to us to receive PIDF (or XPIDF).

## UAS Events

Events are sent and received via the events object store in options.em. This can be supplied or if not a new object will be created when the presence object is created.

babble-drachtio-presence handles SUBSCRIPTIONs and renewals. It also listen out for PUBLISH events. It also subscribes to UACs to to receive NOTIFYs for DND.

### Subscription - presence.subscribe.in

babble-drachtio-presence emits a "presence.subscribe.in" event with a contenttype . The structure supplied is

```json
{
  "contenttype": "application/pidf+xml",
  "entity": "1000@bling.babblevoice.com",
  "expires": 60
}
```

* contenttype contains the content type which the subscription has asked for
  * "application/pidf+xml": status
  * "application/xpidf+xml": status (Polycom only?)
  * "application/dialog-info+xml": dialogs
* entity is what the subscriber is subscribing to
* expires...

This is only fired when a new subscription is generated. When existing subscriptions are refreshed this is not fired. To conform to RFC these events must be responded to. Otherwise the initial NOTIFY which is a requirement is not sent. It is only fired to query the initial status for that entity. If we already have a status for that event type it will not be fired.

### Voicemail - presence.voicemail.in

We receive a subscription for voicemail so we emit this event. Something **must** respond with presence.voicemail.out. The content type is simple-message-summary.

```json
{
  "contenttype": "application/simple-message-summary",
  "entity": "1000@bling.babblevoice.com",
  "expires": 30
}
```

### Voicemail - presence.voicemail.out

Once the subscriptions event for voicemail has been emitted (presence.voicemail.in). It **must** be answered with a presence.voicemail.out event. When voicemail has been updated this event is also used. If it is not answered, then the client will not receive an initial response. Reason is supplied and should be either "init" or "update". Init is a response to presence.voicemail.in. Update is when something of interest happens required notifying.

```json
{
  "entity": "1000@bling.babblevoice.com",
  "newcount": 0,
  "oldcount": 0,
  "newurgent": 0,
  "oldurgent": 0,
  "reason": "init"
}
```

If you create your own voicemail system, then you also have to set the option.dummyvoicemail = false. Dummyvoicemail can also be used as a reference for what needs sending.

#### From us - presence.status.out

This object should be emitted to trigger a PIDF/XPIDF document to be generated and sent onto all watchers of that entity.

```json
{
  "entity": "1000@bling.babblevoice.com",
  "status": "open",
  "note": "",
  "dnd": false,
  "onthephone": false
}
```

### Dialogs

When we receive a subscribe for application/dialog-info+xml then the presence module emits presence.subscribe.in, this should be responded with a presence.dialog.out.

We send out Dialog information via presence. This module will look out for presence.dialog.out events. The presence module then creates the relevant dialog document and sends onto all watchers. This event takes most of it structure from RFC 4235.

The update field should only be present if this is triggered by an event to that dialog. The all field is only provided if we have actual dialogs for that entity.

```json
{
  "entity": "1000@bling.babblevoice.com",
  "display": "Miss Piggy",
  "update": <*dialog>,
  "all": Set( <*dialogs> )
}
```
Where a dialog has to provide the following interface

```json
{
  "hasmedia": true,
  "direction": "initiator|recipient",
  "statestr": "trying|proceeding|early|confirmed|terminated",
  "startat": 0,
  "answeredat": 0,
  "endat": 0,
  "duration": 0,
  "sip": { "callid": "" },
  "remote": {
    "display": "Kermit Frog",
    "uri": ""
  },
}
```

## UAC Events

### presence.status.in

When we receive a NOTIFY from a client, we emit information via the events object. We use presence.in - the presence object does not forward this information onto any watchers. For example, if we have 2 UACs registered against 1 account and we received a DND for one of those accounts we can update that registration with this information as it might be useful for other decision making. If all registrations are marked as DND then we then might want to send out a status of DND to all watchers. Information is parsed from PIDF (or XPIFD) and distilled into status, note, dnd and onthephone. I intend to use this mechanism for the registrar to get then generate the presence.out as required (based on all registrations for that account).

```json
{
  "entity": "1000@bling.babblevoice.com",
  "source": {
    "event": "NOTIFY"
  },
  "status": "open",
  "note": "",
  "dnd": false,
  "onthephone": false
}
```

## PUBLISH

In my first version I did start to implement PUBLISH - but in order to get going I decided to simplify and remove for now. Most functions should be able to be supported with SUBSCRIBE.

## Refs

* Session Initiation Protocol (SIP) - [RFC 3261](https://tools.ietf.org/html/rfc3261)
* Session Initiation Protocol (SIP)-Specific Event Notification (obsoleted by 6665) - [RFC 3265](https://tools.ietf.org/html/rfc3265)
* Presence Information Data Format (PIDF) [RFC 3863](https://tools.ietf.org/html/rfc3863)
* RPID: Rich Presence Extensions to the Presence Information Data Format (PIDF) [RFC 4480](https://tools.ietf.org/html/rfc4480)
* An INVITE-Initiated Dialog Event Package for the Session Initiation Protocol (SIP) - [RFC 4235](https://tools.ietf.org/html/rfc4235)
* SIP-Specific Event Notification - [RFC 6665](https://tools.ietf.org/html/rfc6665)
* SIP Message Waiting [RFC 3842](https://tools.ietf.org/html/rfc3842)
* XPIDF Data format - MS specific [A Data Format for Presence Using XML](https://tools.ietf.org/html/draft-rosenberg-impp-pidf-00)
* Not currently supported - but should look at: [An Extensible Markup Language (XML) Based Format for Watcher Information](https://www.rfc-editor.org/rfc/rfc3858.html)
