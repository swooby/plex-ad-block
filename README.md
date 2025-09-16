# plex-ad-block

*.har files are Chrome Network traces of:
1. The Walking Dead playing
2. A few ads showing
3. The Walking Dead resuming

15:38:42.829 content.js:14 onMessage: msg {type: 'PROGRAM', url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/138…e725973f9b30af6dda00b5550568/hls-v2/4300-00382.ts'}
15:38:49.016 content.js:14 onMessage: msg {type: 'PROGRAM', url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/138…e725973f9b30af6dda00b5550568/hls-v2/4300-00383.ts'}
15:38:55.262 content.js:14 onMessage: msg {type: 'PROGRAM', url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/138…e725973f9b30af6dda00b5550568/hls-v2/4300-00384.ts'}
15:39:12.772 content.js:14 onMessage: msg {type: 'AD_START', at: 1757975952772, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/ads…d9bc1-7291-4cb0-b8f9-00132ec4/asset3000k_00001.ts'}
15:40:27.534 content.js:14 onMessage: msg {type: 'AD_END', at: 1757976027534, durationMs: 74762, segments: 16}
15:40:32.785 content.js:14 onMessage: msg {type: 'PROGRAM', url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/138…245906a3431a3116957d063be681/hls-v2/4300-00385.ts'}
15:40:38.056 content.js:14 onMessage: msg {type: 'PROGRAM', url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/138…245906a3431a3116957d063be681/hls-v2/4300-00386.ts'}
15:40:43.149 content.js:14 onMessage: msg {type: 'PROGRAM', url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/138…245906a3431a3116957d063be681/hls-v2/4300-00387.ts'}
15:40:49.307 content.js:14 onMessage: msg {type: 'PROGRAM', url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/138…245906a3431a3116957d063be681/hls-v2/4300-00388.ts'}

Example of an ad ending...
18:25:13.080 sw.js:77 [ADDETECT] AD_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/ads/tm/04fd913bb278d8775298c26fdca9d9841f37601f/3c8b3f88-d492-4271-a98e-2346dbd3/asset3000k_00004.ts {t: 1757985913080, event: 'AD_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/ads…b3f88-d492-4271-a98e-2346dbd3/asset3000k_00004.ts', creative: '3c8b3f88-d492-4271-a98e-2346dbd3', …}
18:25:18.666 sw.js:77 [ADDETECT] AD_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/ads/tm/04fd913bb278d8775298c26fdca9d9841f37601f/3c8b3f88-d492-4271-a98e-2346dbd3/asset3000k_00005.ts {t: 1757985918666, event: 'AD_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/ads…b3f88-d492-4271-a98e-2346dbd3/asset3000k_00005.ts', creative: '3c8b3f88-d492-4271-a98e-2346dbd3', …}
... and The Walking Dead bumper playing for a few seconds ...
18:25:24.375 sw.js:77 [ADDETECT] PROG_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00006.ts {t: 1757985924375, event: 'PROG_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00006.ts'}
18:25:24.375 sw.js:77 [ADDETECT] AD_END_SCHEDULED tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00006.ts {t: 1757985924375, event: 'AD_END_SCHEDULED', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00006.ts', due: 1757985934197, …}
18:25:30.670 sw.js:77 [ADDETECT] PROG_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00007.ts {t: 1757985930670, event: 'PROG_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00007.ts'}
18:25:30.671 sw.js:77 [ADDETECT] AD_END_SCHEDULED tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00007.ts {t: 1757985930671, event: 'AD_END_SCHEDULED', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00007.ts', due: 1757985934197, …}
18:25:34.199 sw.js:77 [ADDETECT] AD_END_TIMER_FIRED tab=2122567971    {t: 1757985934199, event: 'AD_END_TIMER_FIRED', tabId: 2122567971, at: 1757985934199, durationMs: 26365, …}
18:25:36.914 sw.js:77 [ADDETECT] PROG_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00008.ts {t: 1757985936914, event: 'PROG_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00008.ts'}
18:25:43.211 sw.js:77 [ADDETECT] PROG_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00009.ts {t: 1757985943211, event: 'PROG_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00009.ts'}
18:25:49.499 sw.js:77 [ADDETECT] PROG_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00010.ts {t: 1757985949499, event: 'PROG_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/168689539/hls-v2/4300-00010.ts'}
18:25:55.738 sw.js:77 [ADDETECT] PROG_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/168689535/hls-v2/4300-00001.ts {t: 1757985955738, event: 'PROG_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/168689535/hls-v2/4300-00001.ts'}
18:26:02.084 sw.js:77 [ADDETECT] PROG_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/168689535/hls-v2/4300-00002.ts {t: 1757985962084, event: 'PROG_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/168689535/hls-v2/4300-00002.ts'}
18:26:08.277 sw.js:77 [ADDETECT] PROG_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/168689535/hls-v2/4300-00003.ts {t: 1757985968277, event: 'PROG_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/168689535/hls-v2/4300-00003.ts'}
18:26:14.038 sw.js:77 [ADDETECT] PROG_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/168689536/hls-v2/4300-00001.ts {t: 1757985974038, event: 'PROG_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/168689536/hls-v2/4300-00001.ts'}
18:26:19.068 sw.js:77 [ADDETECT] PROG_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/168689536/hls-v2/4300-00001.ts {t: 1757985979068, event: 'PROG_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/168689536/hls-v2/4300-00001.ts'}
... and then the show resuming...
18:26:23.555 sw.js:77 [ADDETECT] PROG_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/138/417580/183830906/d2eeb99b577d295968d7d8455aecf203/hls-v2/4300-00168.ts {t: 1757985983555, event: 'PROG_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/138…b99b577d295968d7d8455aecf203/hls-v2/4300-00168.ts'}
18:26:27.503 sw.js:77 [ADDETECT] PROG_URL tab=2122567971   https://amc-twdfanexperience-1-us.plex.wurl.tv/138/417580/183830906/d2eeb99b577d295968d7d8455aecf203/hls-v2/4300-00169.ts {t: 1757985987503, event: 'PROG_URL', tabId: 2122567971, url: 'https://amc-twdfanexperience-1-us.plex.wurl.tv/138…b99b577d295968d7d8455aecf203/hls-v2/4300-00169.ts'}
