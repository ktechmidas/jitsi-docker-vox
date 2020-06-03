// cf. https://voximplant.com/blog/ivr-module-usage-example
// cf. https://voximplant.com/docs/references/voxengine/ivr

// enable IVR module
require(Modules.IVR);


const MAPPER_URL = "https://api.jitsi.net/conferenceMapper";
const TTS_VOICE = Language.US_ENGLISH_FEMALE;
const HTTP_REQUEST_TIMEOUT_SEC = 600;
let callAlerting;
let selectedRoom;
let confId;
let confJID;
let confName;

function getConferenceUrl(number) {

    // Handle the HTTP request to get the conference mapping
    function onResponse(res) {
        if (res.code === 200) {
            let result = JSON.parse(res.text);
            if (result.conference) {
                confId = number;
                confJID = result.conference;
                var confstrsearch = confJID.search("@");
                confName = confJID.substring(0,confstrsearch)
                Logger.write(`${confId} for ${confName}`);

                // Move to the next IVR state to check for a password
                inboundCall.removeEventListener(CallEvents.PlaybackFinished, getConferenceUrl);
                joinRoom(confJID);
                //VoxEngine.terminate();

            } else {
                triggerPlaybackOnInboundCall("unknownConference",
                    "You have specified an unknown conference number.",
                    handleConferenceFailedPlaybackFinished);
            }
        } else {
            Logger.write(`Conference number confirmation call failed for cid: ${number} with status: ${res.code},` +
                `message: ${res.text}, headers ${JSON.stringify(res.headers)}`);
            triggerPlaybackOnInboundCall("lookupError",
                "Something went wrong confirming your conference number, please try again.",
                handleConferenceFailedPlaybackFinished);
        }
    }

    // Helper function for grabbing conferencing info
    let url = MAPPER_URL + "?cid=" + number;
    Net.httpRequest(url, e => {
        if (e.code === 200 || (e.code >= 400 && e.code < 500)) {
            onResponse(e);
        } else {
            Logger.write(`retrying ${url} because of error: ${e.code} -> ${e.error}`);
            // e.code can be <= 8 https://voximplant.com/docs/references/voxengine/net/httprequestresult#code
            // or any of HTTP code (2xx-5xx)
            Net.httpRequest(url, e => {
                if (e.code !== 200) {
                    Logger.write(`httpRequest error after 2nd attempt for ${url}: ${e.code} -> ${e.error}`);
                }
                onResponse(e);
            }, { timeout: HTTP_REQUEST_TIMEOUT_SEC });
        }
    }, { timeout: HTTP_REQUEST_TIMEOUT_SEC });
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
        username     : "jigasi",
        callerid     : callAlerting.callerid,
        displayName  : getDisplayName(callAlerting.callerid),
        extraHeaders : { 'X-Room-Name'    : encodeURI(room),
                         'VI-CallTimeout' : 5,
                       },
        video        : false,
        scheme       : callAlerting.scheme,
    });
    
    VoxEngine.easyProcess(inboundCall, outboundCall);

    // cf. https://github.com/voximplant/easyprocess/blob/master/easyprocess.js
    outboundCall.removeEventListener(CallEvents.Failed);
    outboundCall.addEventListener(CallEvents.Failed, () => {
        msg = 'The conference in the room ' + confName + ' has not been started.';
        msg += ' Please try again after the conference has been started.';
        inboundCall.say(msg);
        inboundCall.addEventListener(CallEvents.PlaybackFinished, VoxEngine.terminate);
    });
}

function triggerPlaybackOnInboundCall(eventName, eventMessage, eventHandler) {
    Logger.write(eventName + ": initiated");
    inboundCall.say(eventMessage, TTS_VOICE);
    inboundCall.addEventListener(CallEvents.PlaybackFinished, eventHandler);
}

function handleConferenceFailedPlaybackFinished() {
    inboundCall.removeEventListener(CallEvents.PlaybackFinished, handleConferenceFailedPlaybackFinished);
    countInitialPromptPlayed = 0;
    confNumberState.enter(inboundCall);
}

function handleCallConnected(e) {
    const ivr = new IVRState("conferencenumber", {
    type: "inputunknown",
    terminateOn: "#",
    timeout: 10000,
    prompt: {
        say: "Welcome to this Jitsi Server. Please enter the meeting pin and press pound",
        lang: TTS_VOICE
    }
    },
    data => {
        let number = data.replace("#", "");
        Logger.write(number)
        getConferenceUrl(number); }, 
    () => {
        // timeout
        VoxEngine.terminate();
    })
    
    ivr.enter(e.call);};

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
