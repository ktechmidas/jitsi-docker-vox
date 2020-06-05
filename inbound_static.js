// cf. https://voximplant.com/blog/ivr-module-usage-example
// cf. https://voximplant.com/docs/references/voxengine/ivr

// enable IVR module
require(Modules.IVR);

// room id (menu selection) : room name
// currently hardcode to 2-digit extensions, see below
const rooms = [
    { extension: '10',  name : 'abc', spoken : 'a b c' },
    { extension: '11',  name : 'test'},
];

let callAlerting;
let selectedRoom;

function generateMenuPrompt(rooms) {
    let msg = 'Dial ';
    for (const [i, room] of rooms.entries()) {
        if (i === rooms.length - 1) {
            msg += ' or ';
        }
        msg += room.extension + ' for room ' + getSpoken(room);
        if (i !== rooms.length - 1) {
            msg +=  ', ... ';
        }
    }
    msg += '.';
    return msg;
}

function getDisplayName(callerid) {
    // TODO can add some logic here
    return callerid;
}

function getSpoken(room) {
    return ' ' + (room.spoken || room.name) + ' ';
}

function joinRoom(room) {
    const inboundCall = callAlerting.call;

    const outboundCall = VoxEngine.callUser({
        username     : 'meet',
        callerid     : callAlerting.callerid,
        displayName  : getDisplayName(callAlerting.callerid),
        extraHeaders : { 'X-Room-Name'    : encodeURI(room.name) + '@muc.meet.jitsi',
                         'VI-CallTimeout' : 5,
                       },
        video        : false,
        scheme       : callAlerting.scheme,
    });
    
    VoxEngine.easyProcess(inboundCall, outboundCall);

    // cf. https://github.com/voximplant/easyprocess/blob/master/easyprocess.js
    outboundCall.removeEventListener(CallEvents.Failed);
    outboundCall.addEventListener(CallEvents.Failed, () => {
        msg = 'The conference in the room ' + getSpoken(room) + ' has not been started.';
        msg += ' Please try again after the conference has been started.';
        inboundCall.say(msg);
        inboundCall.addEventListener(CallEvents.PlaybackFinished, VoxEngine.terminate);
    });
}

function handleJoinRoom(e) {
    inboundCall.removeEventListener(CallEvents.PlaybackFinished, handleJoinRoom);
    joinRoom(selectedRoom);
}

function handleCallConnected(e) {
    const introPrompt = 'Welcome to our Jitsi server.';
    const ivr = new IVRState('menu', {
        type        : 'inputfixed',
        inputLength : 2,
        prompt      : { say  : introPrompt + ' ' + generateMenuPrompt(rooms) },
        timeout: 10000 // ms
    }, (selectedExtension) => {
        selectedRoom = rooms.find( ({ extension }) => extension === selectedExtension );
        if (!selectedRoom) {
            inboundCall.say('Invalid room.');
            inboundCall.addEventListener(CallEvents.PlaybackFinished, VoxEngine.terminate);
        } else {
            inboundCall.say(
                'You are joining the room ' + getSpoken(selectedRoom) + ' .');
            inboundCall.addEventListener(CallEvents.PlaybackFinished, handleJoinRoom);
        }
    }, () => {
        // timeout
        VoxEngine.terminate();
    });
    
    ivr.enter(e.call);
}

// handle incoming call
VoxEngine.addEventListener(AppEvents.CallAlerting, (e) => {
    callAlerting = e;

    // add event listeners
    inboundCall = e.call;
    inboundCall.startEarlyMedia();
    inboundCall.addEventListener(CallEvents.Connected, handleCallConnected);
    inboundCall.addEventListener(CallEvents.Disconnected, VoxEngine.terminate);
    inboundCall.answer()
});
