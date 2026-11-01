# Changelog

## Unreleased

- **Just press Play.** Turn it on in Settings under Player, and Play or an episode click starts the best stream straight away. dx.bi remembers what you choose for each series or everywhere, and you can cap the quality. It never picks a stream that would start a new debrid download or a cinema recording. A note in the player says what it picked, with a Change button (#55).
- **A clean stream list.** Each stream is now one simple row with its quality, source, size and whether it's ready to play. The best match comes first, and links out to rent or buy come last.
- **Because you watched.** A new Home row suggests popular titles that share genres with what you watched last. Kids viewers don't get it.
- **Save my year.** Your stats can now be saved as a picture to share, with your hours, top titles and top genre. It stays on your device unless you share it.
- **Lite mode on dx.bi TV.** Slower boxes load fewer Home rows at once, skip hover cards and sharper posters, and ignore presses that arrive too late. It turns on by itself with 2 GB of memory or less, and can be set in Settings (#56).
- **Nightly check against Stremio.** A test now runs every night and opens an issue if a change to web.stremio.com breaks dx.bi.

## 2.25.0

- **Smoother 4K in the desktop app.** Chromium only held about 150 MB of a film, so high-bitrate 4K kept stalling with next to nothing loaded ahead. It now keeps much more. Seek previews also wait until 10 seconds are loaded, so they no longer compete with the film.
- **A proper phone layout upright.** Movie and series pages are tighter, so episodes and streams are much closer to the top. The top bar stays readable, See All sits at the edge, Search keeps your profile on screen, and the empty band above the bottom bar is gone.
- **Watch party roles.** The person who starts a party is the host, and only the host and mods can now play, pause and skip for everyone. Anyone else who tries goes straight back to the party. In the People list the host can make someone a mod, remove anyone, or choose *let everyone control* for a party of friends. Mods can remove viewers. If the host leaves, the mods carry on, and the host gets their role back on returning from the same device.
- **Parties can't be taken over.** New party codes are longer because they prove who the host is, and every message is signed, so a changed copy of the app can't pretend to be the host or pause everyone. A viewer can also only hold the party up for buffering a few times. Everyone needs 2.25.0 for the new codes. Older codes still work, with everyone in control.

## 2.24.0
- **Sound on every film and episode on phones.** Most phones have no Dolby or DTS decoder, so those films and episodes played in silence. dx.bi TV now decodes them itself when the device can't. Sound sent straight to an AV receiver works as before. The Audio list names each track's format, and a track that still can't play is listed with the reason. From Nathflix, thanks to Lavagnou.
- **Viewers stay the same on every device.** With two or more viewers, a title watched on the TV no longer turns up in the first viewer's Continue Watching on your computer. Viewers, who owns which title, hidden titles and Home layouts now follow your Stremio account. If you made the same person on two devices, they're joined by name. This uses a small dx.bi server: your Stremio login key is only used to check who you are and is never saved, and your parental PIN stays on each device. With one viewer nothing is sent. Turn it off with *Keep viewers the same on every device*. From Nathflix, thanks to Lavagnou.
- **A quicker Home on dx.bi TV.** Home used to load every row, which made it much heavier on long addon lists. It now loads the first rows, then more just ahead of the remote. Big soft shadows are gone on TV too, and row arrows are only measured for the row under the mouse, on every device. From Nathflix, thanks to Lavagnou.
- **A series opens on its episodes.** Continue Watching cards used to jump straight to the stream list of the last episode you watched. They now open the episode list, on the season you were watching, and My List does too. The play button on a Continue Watching card still picks up where you left off.
- **mpv on Linux under Hyprland, for those who want to try it.** Start dx.bi with `DXBI_MPV=1` and `--ozone-platform=x11`. It needs mpv installed. Thanks to cgngtr.

## 2.23.0
- **Colours from the title.** A title's page and its player take a colour from its artwork: Dune goes orange, Avatar blue. The main button, other accent-coloured buttons and the seek bar follow it, always in a shade white text can be read on. Black and white or very muted artwork keeps your accent colour, and so does the Mono accent. Switch it off with *Match each title's colours* in Look. It works on dx.bi TV too, including the seek bar.
- **dx.bi TV: trailers play inside dx.bi.** They used to flash the player screen and then open the YouTube app. Now they open straight in dx.bi's own full-screen trailer player. OK pauses, left and right skip 10 seconds, and Back returns to the title. The YouTube app is only used for the few trailers whose owners don't allow them to be played elsewhere.
- **dx.bi TV has dx.bi's player.** The plain Android controls are gone. The TV player is now laid out like the one on a computer: back and the clock at the top, the times and seek bar in your accent colour, play, 10-second skips and next episode on the left, the title in the middle, and stream stats, picture, speed, subtitles and audio on the right.
- **Subtitle timing on dx.bi TV.** Move subtitles earlier or later, a quarter of a second at a time, from the subtitles button.
- **Dialogue boost and Night mode on dx.bi TV.** The same sound modes as on a computer, under Picture & sound. Sound sent straight to an AV receiver as Dolby or DTS can't be changed.
- **Zoom on dx.bi TV.** 110%, 125%, 133%, and Remove black bars, which makes wide films bigger on screens wider than the film's file (Android 8 and later).
- **Up next on dx.bi TV.** A card with the next episode's picture counts down over the credits, and the next episode starts with the same release when dx.bi finds it.
- **Android phones.** The player turns upright, and the phone layout now works on its side too: text was tiny and the profile menu ran off the screen. Phones no longer mention "this TV" or the remote.
- **Watch party on dx.bi TV.** Start or join a party from the people button at the top, with the remote. Play, pause and jumps stay in sync with everyone, you follow the host to a new episode, and a Party button in the player shows the code and who's watching, and lets you leave.
- **dx.bi TV finds updates more reliably.** It used to check only on a full start, which can be days apart on a TV. It now also checks when you come back to it, at most every 6 hours, and still finds an update when GitHub's limit on update checks has been reached.
- **dx.bi TV: Update is the selected button.** The update message used to open on *Skip this version*, so pressing OK skipped it. After you allow dx.bi to install apps, the download now carries on by itself.
- **dx.bi TV: Up in Settings no longer skips rows.** After the page had scrolled, Up jumped past rows above the screen to the top bar.
- **dx.bi TV: Find streaming server lists the TV once.** A server on the TV itself used to show up twice.
- **Subtitle styles in the mpv player.** *Subtitle style* now changes the colours, outline, shadow and background in the built-in mpv player too, not only in the browser player. *Stremio default* puts your Stremio settings back. Thanks to EskimoDev (#46).
- **Your language on the billboard.** The billboard, hover cards and wide Continue Watching cards now use your own metadata addons, so an addon set to French shows French titles and descriptions. In a non-English interface the billboard also picks its titles from your addons. The billboard buttons are translated into French. In English the billboard still shows what's popular now. Thanks to EskimoDev (#52).

## 2.22.1
- **dx.bi's settings are back.** In 2.22.0 the dx.bi app and Stremio Enhanced refused all of dx.bi's settings because of one new option, so the Settings button disappeared. Your saved settings were kept and kept working. On dx.bi TV, *My List on Home* now shows as a normal choice.

## 2.22.0
- **Support dx.bi.** The dx.bi app has a *Support dx.bi* button in Settings → About, and dx.bi TV has a *Support dx.bi* row in Settings with a code to scan with your phone. dx.bi stays free.
- **dx.bi on Android phones fits upright.** The app is laid out at the phone's own width, so text and buttons are the normal size. The billboard shows in full with its logo and buttons centred, the tabs move to a bar at the bottom, and Discover and Library show three titles across.
- **Customise Home.** Move, hide or rename any Home row, whichever addon it comes from, from the profile menu (on TV, also in Settings). Saved per viewer.
- **My List on Home.** Your library as a row under Continue Watching, or separate rows for films and shows. Change it in dx.bi settings.
- **The time in the player.** The time now and when this ends show at the top right with the controls, on desktop and TV.
- **Sharper posters.** Bigger posters load when your screen can show them. On a TV only the title you're on is upgraded, and only the last few stay that way, so browsing stays quick.

## 2.21.3
- **dx.bi TV: Who's watching? works with the remote.** The remote skipped dx.bi's entries in the profile menu, so viewers couldn't be added on a TV, and with one viewer the picker never shows at start. The entries can be reached now, and *Who's watching?* is also in Settings. On its screen the selection starts on the current viewer, Back steps out, and in Manage viewers you can rename a viewer by choosing them and remove them with the Remove button.
- **dx.bi TV: Report a problem from the profile menu** opens the same remote-friendly dialog as Settings.
- **dx.bi TV: less lag on 4K TVs.** They drew the page at 3840 pixels, four times the work of 1080p, often with under 2 GB of memory. The page is now drawn at 1080p and scaled up. Videos still play at full resolution, in their own window.
- **dx.bi TV: lots of addons no longer hold up Home.** Every row used to be fetched at once when Home opened. Rows now load eight at a time, and wait while you're moving around.
- **dx.bi TV: no more dead end when no streaming server is found.** The message now offers *Play it on this TV* when a torrent is waiting, and mentions the Windows firewall.
- **dx.bi app: a warning when Stremio is slow to load.** Stremio's web app is downloaded from web.stremio.com at every start. If that takes more than 45 seconds, dx.bi says so instead of staying on a black screen, and offers to keep waiting or try again. The message closes by itself once Stremio appears.
- **Volume percentage in the player.** The volume shows as a number above the speaker button while you hover or drag the slider, or change the volume with the keyboard.
- **Custom subtitle fonts in the mpv player.** Pick from the list, or choose *Custom installed font* and type the name of a font installed on your computer, useful for Arabic and other non-Latin subtitles. Thanks to EskimoDev (#43).
- **Windowed mpv on Windows.** The picture no longer disappears behind a blank surface in a window, and the minimize, maximize and close buttons no longer flicker during playback. Thanks to EskimoDev (#42).

## 2.21.2
- **No more terminal windows flashing on Windows.** The dx.bi app's streaming server starts ffmpeg, ffprobe and other helpers in the background. On Windows each one opened a terminal window that flashed and closed. They now run hidden.
- **Volume boost up to 200% with mpv.** Stremio's volume slider goes to 200%, but the built-in mpv player stopped at 130%, so the slider snapped back. mpv now goes up to 200%, and dx.bi remembers a boosted volume for each viewer. Thanks to EskimoDev (#36).

## 2.21.1
- **Report a problem now points to #bug-reports.** After you send a report, dx.bi (app, plugin and TV) tells you to post your code in dx.bi's Discord **#bug-reports** instead of #help. The forum's guidelines now ask for that code instead of your system, version and player stats, which the report already carries.

## 2.21.0
- **Every viewer has their own library.** A new viewer in *Who's watching?* now starts with an empty Library and Continue Watching instead of seeing everyone else's. What a viewer adds or plays goes in their library only; everything that was already in your account stays with the first viewer. Removing a title (or dismissing it from Continue Watching) that someone else also has only takes it out of yours, and removing a viewer clears the titles only they had. Calendar, new episode badges, Airing this week and stats follow the viewer too. Addons stay shared. Two viewers watching the same title still share its progress: that's kept by the Stremio account.
- **dx.bi TV on phones and tablets: the keyboard opens again.** Tapping the email or password box on the login screen (or Search) did nothing on phones like the Galaxy S25: text boxes waited for the remote's OK button. A tap now types straight away; the remote works as before.
- **dx.bi TV: addons that set their own browser identity for a link** now have only theirs sent with it, not dx.bi's as well.

## 2.20.0
- **dx.bi TV plays the real intro.** TVs only showed a still "DX.BI" while dx.bi started, even with *Intro animation* and *Intro sound* on: the film was too heavy for the page on 2 GB sticks. The TV app now plays it itself, decoded in hardware, with its sound, your accent colour and Sound volume. OK or Back skips it. Needs the 2.20.0 TV app.
- **Picture-in-picture keeps playing while you browse** (dx.bi app). It used to close as soon as you left the player. Now it moves to a small window that stays on top, picking up from the same second, and you can browse, search and open other titles meanwhile. It works like Discord's pop-out stream: drag it anywhere, pull its corner to make it bigger or smaller, double-click (or ⤢) to go back to full size where it was, and hover it to play/pause or close it. Playing something else closes it. During a watch party, picture-in-picture works as before.
- **No more dead Cast button in the dx.bi app.** Stremio's Cast button needs Chrome's Google Cast, so in the desktop app (and on TV) it did nothing when clicked. It's hidden there now.

## 2.19.3
- **HEVC releases play as they are again, on Macs too.** When a converted copy of a failed release played, dx.bi remembered that this computer can't decode 10-bit HEVC and converted every HEVC release from then on, even when the first failure was Dolby Vision or the audio. On Macs, which play HEVC themselves, that made 4K and remux releases fail with *Error occurred when decoding* or *Video is not supported*. That memory is cleared, and Dolby Vision failures no longer set it.
- **"Play without converting".** When dx.bi converted a release before trying it and the converted copy fails, the error now offers to play it as it is. If it plays, dx.bi stops converting those releases.
- **Clearer message when the streaming server can't open a link.** Some sources (often on workers.dev) only answer browsers, so converting them can't work: dx.bi now says so instead of calling the file damaged.

## 2.19.2
- **dx.bi TV: torrents only play on the TV when you say so.** *Play torrents on this TV* is now off by default: torrents go through debrid (Real-Debrid, TorBox…) or a computer's streaming server. Picking a torrent with neither now asks: use a computer on your network, play it on this TV just this once, or cancel.
- **dx.bi TV: trailers open in the YouTube app.** They started, paused after a few seconds and dropped back out. Back returns to dx.bi.
- **dx.bi TV: updates install reliably.** An update is now checked after it downloads (every byte there, and really a dx.bi app) and downloaded again if it was cut short, and pressing *Update* twice no longer breaks it. This was the "There was a problem parsing the package" message.
- **dx.bi TV: dx.bi in Settings' list.** dx.bi's settings are now also at the end of Settings' own list (after Shortcuts), as well as at the top of General.
- **Interface sounds are off by default** on new installs. Switch them on in dx.bi settings → Intro & sounds.
- **The profile menu's dx.bi entries line up** with Stremio's own (their icons sat against the text).

## 2.19.1
- **Report a problem, from anywhere.** In the app and the plugin it's in your profile menu; on dx.bi TV it's at the top of *Settings*. Say what went wrong and dx.bi sends its developer the details that help fix it: version, device, settings, addon names, how many titles your library has, what each part is doing and recent errors. You get a short code to mention in Discord. No e-mail, passwords, keys or stream links are sent (links are cut down to the site's name).
- **The Calendar fills in when the TMDB addon is down or removed.** Shows added from the TMDB addon's rows now get their episodes from Cinemeta (found by their IMDb id), so they appear in the Calendar, new episode badges and Airing this week again.
- **dx.bi TV: Play torrents on this TV** can be switched off in dx.bi settings → Player, for anyone who only plays debrid streams (Real-Debrid, TorBox…) or wants torrents to go through a computer's streaming server.

## 2.19.0
- **dx.bi TV plays torrents by itself.** No computer and no streaming server needed: the TV downloads the episode or film in order, the part you're watching first, and plays it as it arrives. While it gets going the player shows how many peers it found and the speed. Jumping ahead works too: that part is fetched first. Only the file you're watching is downloaded, and it's deleted when you stop. A streaming server you've picked in *Settings* (dx.bi or Stremio on a computer) is still used when it's online.

## 2.18.1
- **The Calendar shows every show in your library.** Stremio's Calendar only gets episodes from Cinemeta, so shows added from other catalogs (the TMDB addon's rows, anime catalogs) never appeared, and a library full of them left the Calendar empty. dx.bi now adds their episodes to the month.
- **"Ends at" on films.** A film's page and its hover card show when it would finish if you started now (from where you stopped, if you're part way through).
- **A tidier Home for new accounts.** dx.bi's one-time offer to set up Home now adds Streaming Catalogs, Anime Catalogs (MyAnimeList's top series and top films, with anime search) and TMDB Collections (Popular and Top Rated). The Movie Database addon is no longer added: its rows repeated Cinemeta's, and it currently fails to install. Anime Catalogs' Popular rows and TMDB Collections' New Releases are left out, as they repeated the other rows. Accounts that already have these addons aren't changed.

## 2.18.0
- **Kids profiles.** In *Who's watching? → Manage viewers*, any viewer can be a kids profile: up to 7, up to 12 or up to 15. Only titles rated for that age show anywhere (Home, the billboard, Discover, Search, Library), and a title's page that isn't says so instead. Ratings come from film certificates (MPA, BBFC, FSK, ClassInd), Kitsu for anime, and TMDB for series when you've added a TMDB key. A title with no rating only shows when it's a family or children's title. Settings and Addons are hidden on kids profiles.
- **Parental PIN.** Set one in *Manage viewers*: it's asked for to leave a kids profile, to manage viewers, to open Settings or Addons from a kids profile, and to let a kid watch something not rated for them. Grown-ups can also mark a title *Allow for kids* on its page.
- **Hide titles.** Never want to see something again? Hide it from its hover card or its page and it's gone from every row, Search and Discover for that viewer. *Manage viewers → Hidden titles* brings it back.
- **dx.bi TV: Skip intro, recap and credits.** The TV player shows a *Skip* button during them (OK presses it), with the same times as the desktop player. *Skip automatically* in dx.bi settings works on TV too.
- **Phones: browse upright.** The Android app turns with your phone and lays dx.bi out as a column when it's upright. Videos still play sideways.
- **Windows: the picture comes back after leaving full screen.** On some PCs the video disappeared once you left full screen (the desktop showed through, often blue).
- **dx.bi TV finds a streaming server for torrents.** A TV has no streaming server of its own, so torrents showed "Error" in Settings and wouldn't play. *Settings → Streaming server for torrents → Find* looks for the dx.bi app or Stremio running on a computer on your network and switches to it in one press. Picking a torrent without a server offers the same search. Debrid streams still play without one.
- **Library and Discover filters work with the remote and the keyboard.** Each row of filters is its own row: left and right stay in it instead of dropping into the titles, up and down move between the rows, and down from the filters goes back to the column you left. Menus (All / Movie / Series, Discover's catalog and genre) open with OK, the arrows go through their choices, and the selection returns to the menu after you pick. A held Up stops at the first row of titles.
- **The end of a row in Library and Discover stays put** on TV, instead of jumping to a title in another row.
- **dx.bi TV: a cleaner selection outline.** The outline now follows each button's own shape (round buttons get a round outline), shows at once instead of fading in, and is no longer cut off around the sort buttons and the billboard's Play and More Info.
- **Windows: the mini player can be moved.** Drag it anywhere. Hovering over it shows play/pause and *Back to dx.bi*, and double-clicking it also goes back.
- **Anime titles no longer cover ratings printed on posters.** Posters from rating services (RPDB, Top Posters and the like) print IMDb and Rotten Tomatoes scores along the bottom, where the anime title strip used to sit.

## 2.17.0
- **dx.bi TV is much smoother.** Tested on a Fire TV Stick 4K: moving down Home's rows went from about 15 to 40 frames a second, sideways from about 45 to 56, and the long freezes (up to a second and a half) are gone. The first trip down Home no longer stalls while rows load, and pressing towards an edge with nothing there no longer hangs for half a second.
- **dx.bi TV: hover cards are back on by default.** A card opens when a title stays selected for a moment, and on TVs it fades in rather than unfolding. Switch it off in dx.bi settings → Hover cards & trailers.
- **dx.bi TV: rows glide sideways** to their next titles again (moving down the page still jumps, which keeps it quick).
- **dx.bi TV: Home's rows load as Home opens**, instead of one by one as you scroll to them.
- **dx.bi TV: Discover shows the selection ring** on the title you're on.
- **Up from the first row** reaches the billboard's buttons again whichever picture is showing, and on Search it reaches the search box and top bar.

## 2.16.0
- **One bar on Windows.** With the mpv player, the app no longer has a separate title bar above dx.bi's top bar: the minimise, maximise and close buttons sit at the right end of the top bar, and in the player they hide with its controls.
- **Move and resize the window like any other** (Windows): drag an empty part of the top bar to move it, double-click it to maximise or restore, pull a maximised window down to restore it, and resize from any edge or corner.
- **No more fullscreen button in the app's top bar**: it repeated the window buttons. F11 still toggles full screen, and the player keeps its own fullscreen button.
- **Titles on anime artwork.** Anime catalogs' cover art usually has no title on it, so dx.bi writes the name at the bottom of each card in Home and Search rows (switch it off in dx.bi settings → Look).
- **Discover no longer highlights its first title** when you arrive: a title only shows as selected once you pick one.
- **dx.bi is now licensed under the GNU GPL, version 3 or later.** You can still use, change and share it freely; shared copies must stay open source and keep the credit. Versions up to 2.15.9 stay MIT. See NOTICE.md.

## 2.15.9
- **dx.bi TV: the selection moves instantly.** Titles no longer grow, zoom and fade as you move, which left the previous title looking selected for a moment on slower sticks (Onn, Shield, Bravia). The selected title gets a ring in your Selection highlight colour.
- **dx.bi TV: holding a direction moves at a steady pace** and stops when you let go (the extra presses used to queue up and keep it going).
- **dx.bi TV: hover cards are off by default**, so browsing with the remote is about twice as light. Switch them back on in dx.bi settings → Hover cards & trailers.

## 2.15.8
- **The player's title no longer runs under the buttons.** It sits in the space between the left and right controls, shortens with "…" as that space shrinks (the episode name first), and steps aside when there's no room.
- **No more grey box behind the player's right-hand buttons** on Windows (and TVs): all the controls are see-through, like the rest of the bar.
- **The billboard fits smaller and shorter screens** (phones on their side, small windows): its label and logo no longer slide up under the top bar or off the screen. The logo shrinks first, then the description gets shorter, then it's left out on very short screens.

## 2.15.7
- **Library: Watched and Not watched now filter.** Stremio only reordered the list with them (watched titles first, or last), so watched titles still showed under Not watched. Now each shows only what it says, straight away when you switch, and says so when there's nothing to show.
- **Ratings on posters** and **New episode badges**: switching them off now clears every badge at once, including titles further along the rows.
- Checked every dx.bi setting in the app against what it should do (including Trailer delay: the trailer starts 0, 1, 3 or 5 seconds after the card opens, as set).

## 2.15.6
- **dx.bi TV: the remote moves freely past text boxes.** The keyboard used to open as soon as the selection reached a search box (Search, an episode list's search), and then it held on to the arrows. Now a text box is just a stop on the way; press OK on it to type, and Back closes the keyboard.
- **dx.bi TV: changes in dx.bi settings now take effect.** They were saved, but the TV never applied them (#14).
- **Selection highlight** (dx.bi TV, Settings → dx.bi settings → Look): white, your accent colour or yellow.

## 2.15.5
- **dx.bi TV no longer closes straight back to the home screen** on 2 GB sticks like the Chromecast with Google TV: the intro is a light logo animation on TVs, dx.bi TV runs a much smaller plugin (about 40% less to load), and the grey "play" icon at start is gone. If the TV still runs out of memory, dx.bi restarts its page instead of closing.
- **dx.bi TV is faster on Fire TV, Onn and other sticks**: rows jump to the next titles instead of gliding (your selection no longer disappears for a moment when you move quickly), and the slow billboard zoom, faded row edges and blurred backdrops are left out on TVs. Hover cards wait a moment longer, and their trailers are off by default on TVs (switch them on in dx.bi settings).
- **Easier with a remote**: a clear white ring shows what's selected (the top bar included), **See All** is at the end of every row, and choosing an actor or director shows their titles instead of opening the keyboard.
- **TV subtitles follow Stremio's subtitle settings** (size, colour, outline, background and position) instead of always white text on black boxes. The player's buttons show which one is selected, and the title no longer stays on screen after the controls hide.
- **dx.bi's settings are grouped** (Look, Home, Player, Subtitles…) **with a search box** in the app, and in sections on TV.
- **Windows: maximize, restore and full screen work with the mpv player.** The window opens properly maximized, Restore brings back its size, dragging no longer makes it grow, and the full screen button works, so **Esc leaves full screen instead of closing the video** (#6, #13).
- The app shows its window once dx.bi is ready, so plain Stremio no longer flashes up first.
- Hover cards: the title's own poster no longer shows around the edges of the card.

## 2.15.4
- **dx.bi is no longer listed twice under Settings → Plugins** after turning on Discord Rich Presence.
- **Discord shows one dx.bi activity**, not two identical ones, after Discord restarts or presence is switched off and on quickly.

## 2.15.3
- **Windows: dx.bi is back in the taskbar and Alt+Tab** while the mpv player is on (the window was left out of both).
- **Windows: no more "Streaming server is not available"** after the first-run question. The app now runs Stremio's streaming server by itself, like on macOS and Linux, so there's nothing to choose or install. If you picked Stremio Service before, it's still used while installed.
- **The intro follows Settings → Sound volume** instead of always playing at full volume.
- **Trailer delay**: choose how long a hover card waits before its trailer starts (right away, 1, 3 or 5 seconds).
- **Watch progress on TVs is kept** when Android restarts the page mid-video (common on low-memory sticks like Chromecast and Fire TV), and files with several audio tracks start in your audio language from Stremio's settings. Thanks @tanishvbuk (#9).
- **TV: trailers can no longer reach the app's settings.** Every call from the page to the app now needs a secret only dx.bi's page knows (#9).
- **Safer external players**: VLC's web remote gets a fresh password each time and only listens on your own computer, and only real web or file links are opened in mpv or VLC (#8).
- **Stremio Service's broken ffprobe on Windows is repaired** when dx.bi starts, and zooming out can no longer crash the app (#8).

## 2.15.2
- **Hover cards are clean in the app**: a grey band with the poster showing through sat above the card (most visible on Windows).
- **Library is calmer**: no ring, lift or pop-out card when you point at a title, just a gentle brighten.
- **The app's window buttons stay on top** of sheets like Reviews, and the watch party panel opens below the top bar instead of over the search box.
- Settings shows the dx.bi app's version as the Shell Version.
- **dx.bi has a Discord**: help, bug reports, release news and watch party codes at https://discord.gg/nnVBjqZ84F (also linked in Settings → dx.bi → About).

## 2.15.1
- **The app updates itself.** On Windows (installed version) and Linux, new versions download in the background and install when dx.bi restarts: no more downloading the app again. On a Mac, and with the portable Windows version, the update popup stays. This starts from the next update after 2.15.1, so install 2.15.1 once by hand.
- **Discord shows the time left and when you pause** again while watching with mpv (it stayed on a plain "Watching").
- Stremio's own Discord switch no longer shows in Settings next to dx.bi's.

## 2.15.0
- **Videos play in mpv inside the dx.bi app on Windows**, like Stremio's own app. Every format plays as it is (HEVC and 10-bit, Dolby Vision, AV1, DTS and TrueHD sound, MKV, the file's own subtitles) with hardware decoding: no more "Video is not supported", no converting, smooth seeking. Stremio's controls, menus and subtitles and all of dx.bi's player features stay on top. Picture enhancement (Anime4K and Sharpen) runs in mpv, and so do zoom, black-bar removal, Dialogue boost, Night mode and picture-in-picture. Switch it off under Settings → dx.bi → *Play videos with mpv*. Opening streams in VLC or the mpv app is still the External player setting.
- **The app opens the way you left it**: maximized, or at its last size and place (maximized the first time).
- **dx.bi TV no longer closes by itself** when the TV runs short of memory (seen on a Chromecast with Google TV): it starts its screen again, more lightly, and says so if it keeps happening.

## 2.14.3
- **"Play in external player" works.** Choosing VLC (or mpv / IINA on a Mac) under Stremio's Settings → Player now opens streams straight in that player, including Play, Continue Watching and the next episode. Before, the video started in the built-in player instead, and you had to wait for it to fail and press VLC every time.
- **Popups are a single card.** Every popup (updates, addons, plugin settings) drew a second, inset card inside the first, which looked cut off at the sides.
- **The app's update popup stays away after Ignore.** It used to come back on every launch, whatever you clicked (#6). It also no longer offers an update before its download is ready, which made Download fetch the version you already had.
- **"Check for updates" in the app's settings works.** Whenever an update existed, it said the check failed and to check your internet connection.

## 2.14.2
- **Smoother playback on Macs.** When a Mac can't play a file as it is, Stremio's streaming server converts it while you watch. It checks that the Mac's hardware video encoder works, but then kept converting on the processor anyway, which can't keep up with 4K HEVC releases on many Macs, so the video stuttered and froze. dx.bi now switches the hardware encoder on, once (you can still change it under Settings → Streaming → Transcode profile).
- After one HEVC release failed to play, dx.bi converted every HEVC release from then on, even when the failed file was simply broken. It now only does that once a converted copy has actually played.

## 2.14.1
- **No more double title bar in the dx.bi app.** On first launch, copying a Stremio Enhanced setup that had window transparency switched on gave the window its normal title bar plus a second one inside the page. The page now follows the window, and transparency isn't copied over (dx.bi's look isn't made for a see-through window).
- **A simpler install guide.** One-click downloads for Windows, Mac, Linux and TVs, with each step a newcomer meets on the way, including the security prompts Windows and macOS show.
- The app's downloads now have the same name in every release, so the links never change.

## 2.14.0
- **dx.bi TV.** dx.bi for Android TV and Google TV, made for the remote: the arrows move around, OK opens, Back goes back. Streams play in a TV player that handles MKV, HEVC, HDR and surround sound, with your addons' subtitles, and your watch progress is shared with every other Stremio app. dx.bi's settings have their own remote-friendly screen under Settings. It updates itself, and offers new versions of the app.
- With nothing selected yet, the first arrow press starts on what's actually showing, including a dialog over the page.

## 2.13.0
- **The dx.bi app.** dx.bi now also comes as its own desktop app for Windows, macOS and Linux, with everything built in: download, open, sign in. It's built on Stremio Enhanced, so it does everything Stremio Enhanced does. The first time it opens, it offers to copy your Stremio Enhanced sign-in, library, settings and plugins over. It downloads and updates Stremio's streaming server by itself, and its Discord status says "Watching dx.bi" with a link to get it.
- **Keyboard browsing.** Get around everything with the arrow keys. The pointer hides while you do, the title you land on previews just like a hovered one, and rows turn to their next page at the edge. Press ↓ on a preview to reach its buttons. Stremio's top bar, settings switches and player buttons, which the keyboard couldn't reach before, now can. Moving the mouse hands control straight back.
- **Keyboard in the player.** Enter steps into the controls and menus (speed, subtitles, audio and the rest), the arrows move between them, and Esc steps back out.
- **No more square outlines.** Whatever the keyboard selects looks the same as when the mouse points at it.
- The billboard no longer slides up when you move between Play and More Info, and holds still while one of them is selected.
- Every player button and icon is the same size.
- Hover cards open with corners that match the posters exactly.

## 2.11.0
- **Reviews on title pages.** Rotten Tomatoes and Metacritic scores now sit beside the IMDb rating, and a new *Reviews* button opens the critics' summary from Wikipedia, with a link to read more. No account or setup needed.
- **Optional free keys add more.** A TMDB key adds audience reviews; an MDBList key adds fresher scores, including Rotten Tomatoes audience, Letterboxd and Trakt. Paste them in dx.bi's settings. Each key is only sent to its own service.

## 2.10.7
- **Hover cards stay open after scrolling a row.** Once a row had been scrolled with the arrows or the wheel, pointing at a title made its card pop open and snap shut straight away.
- Releases now ship just the plugin and the installers; the theme is built into the plugin.

## 2.10.6
- **Every player button says what it is.** Hover any of Stremio's own player buttons (speed, cast, subtitles, audio, episodes, statistics, more options, back) and it shows its name.
- **No more giant arrow over the video on Windows.** The player's top-bar icons always stay small and let clicks through to the video.

## 2.10.5
- **Rows fade softly into the screen edges.** Titles that slide aside for a hover card, or peek in from a scrolled row, now fade out at the edge of the screen instead of being sliced off.
- **Continue Watching stays calm.** Its cards no longer open a hover card; they lift gently and show play and the remove tab.

## 2.10.4
- **Hover cards open without a single stutter.** Measured on a 165 Hz screen, the opening used to start with frames of 117, 45 and 40 ms; now every frame is about 6 ms. The causes, all fixed:
  - Several theme rules made the browser restyle the whole page whenever anything was hovered or added (`body:has(...)`, and `:hover`/`:focus` rules followed by `[class*=...]`). Hover effects now use variables set on the hovered element itself, and the plugin marks rows and cards with plain attributes instead of `:has()`.
  - The title's details and artwork are now fetched and decoded while the pointer rests, before anything moves, and the row is measured before the animation starts.
  - The poster no longer fades early, which briefly showed the layer underneath.
- **Titles cut off by the edge of the screen stay in their row:** no hover card pops out over the edge. Titles at either end of the screen grow inwards from their own edge.
- New screenshots and hover animation in the README.

## 2.10.3
- **Hover cards unfold smoothly.** The card opens out from the poster's own outline, with a soft glow in the title's colours, and the titles either side glide aside to make room (and back when it closes). Moving along a row, each card now opens exactly over its title instead of drifting.
- **Trailers full screen.** While a hover card's trailer plays, the new full-screen button carries on from the same moment, with sound, in dx.bi's own player: title art, Play and More info, pause, mute and a seek bar that fade away when the mouse is still. Esc closes it; Space, M and the arrow keys work too.
- **Continue Watching remove button.** It no longer hides under the "+N new episodes" badge (the badge steps aside on hover), and it's now a slim tab that opens out into *Remove*. Pointing at it never opens the hover card, and hover cards for Continue Watching titles have their own remove button.
- **Fixed a title's hover card sometimes not opening again** after you moved away while it was loading.

## 2.10.2
- **No more "streaming server isn't running" by mistake.** When a converted video failed, dx.bi could wrongly say the server wasn't running: it gave up after 2.5 seconds while the server was busy, or checked again when Stremio redrew its error box. It now waits longer, asks twice, and keeps the first answer it worked out.
- **Better advice for Windows error 3221225781.** The missing file isn't Media Foundation, as 2.9.6 said: Stremio Enhanced's own ffprobe only needs files every Windows has. The fix is Stremio Service, re-downloading ffmpeg/ffprobe, or updating a copy of ffmpeg you installed yourself (Stremio Enhanced uses it first).
- *Copy details* now includes the Windows build and processor type.

## 2.10.1
- **Never two billboards on Home.** If the plugin was updated or reloaded while Home's billboard was still loading, the old copy could add a second billboard above the new one. It now checks first and clears any leftover.
- New screenshots and short animations in the README.

## 2.10.0
- **Picture & sound panel** (the sliders button in the player):
  - remove black bars that are part of the video, measured from the picture, or zoom to 110%, 125% or 133%
  - Dialogue boost and Night mode, for 5.1 and stereo
  - subtitle sync: click the line you just heard
  - a second subtitle language at the top of the picture
- **Library sorting** — newest, oldest or top rated, plus a genre filter.
- **Watched titles** — optionally dim or hide them in Discover, Search and Home.
- **Next episode loaded early** — near the end, the same release is warmed up so it starts sooner (cached debrid links or your own streaming server only).
- **Subtitles on HDR** — optionally dimmed to grey.
- **Fixes** — subtitle style and font now reach addon subtitles; picture enhancement follows Stremio's Crop and Stretch; the player title no longer collides with buttons on narrower windows.

## 2.9.6
- **Recognises a Windows-only converter failure**: when Windows can't start the streaming server's converter because a system DLL is missing (error 3221225781, usually Media Foundation missing on Windows *N* editions), dx.bi says so and explains the fix (install the *Media Feature Pack*, or use *Stremio Service*).

## 2.9.5
- **Copy details** on the error screen when a converted video won't play: a short report of the streaming server's version and conversion settings, the file's formats and what the converter returned (no links, keys or titles), to paste into a GitHub issue.
- More reliable check of whether the converter worked: if the player's download records hide the result, dx.bi asks the server again itself.

## 2.9.4
- **Fixed conversion being skipped when you reopen the same release** (a common way to retry). Each visit to the player now checks again.
- **When a converted video still fails, dx.bi says why.** If Stremio's streaming server is set to convert with hardware acceleration (*Settings → Streaming → Transcode profile*), which often fails on a PC's graphics card or driver, there's a one-click **Convert without hardware acceleration**. If the server's converter produced nothing, it says so (restart Stremio Enhanced, or reinstall Stremio Service on Windows). Otherwise it's the file itself.

## 2.9.3
- **Flags show on Windows.** Windows has no flag emoji, so stream languages appeared as letters ("GB / JP / RU"). dx.bi now uses a small flag-only font (Twemoji Country Flags), so flags look the same on every system.
- **Fixed the streams list looking jumbled on Windows** (rows drawn over each other, Stremio's "Install addons" button showing through). Chromium on Windows can leave stale copies of a scrolled panel that has a blurred glass background, so on Windows those panels and menus now use solid backgrounds.

## 2.9.2
- **Fixed "Video is not supported" on Windows** (and other PCs without 10-bit HEVC decoding). Stremio only checks basic HEVC support, then sends 10-bit HEVC and Dolby Vision releases unconverted, which those PCs can't decode. dx.bi now has Stremio's streaming server convert them to H.264 when this PC can't decode them, and retries any video that fails the same way. New setting *Convert videos this PC can't play*: Auto (default), Always, or Never.
- **Uncached debrid releases explained.** Instead of the green "Torrent is being downloaded to debrid…" clip, dx.bi pauses it and says what's happening (still downloading, limit reached, access refused or failed), with *Pick another stream*.

## 2.9.1
- **Home shows only movie, series & anime rows** (new setting, on by default). Rows from addons that list other things, like a debrid account's downloads or YouTube channels, are hidden on Home and stay available in Discover.

## 2.9.0
- **Trailers in hover cards**: rest on a title and its trailer fades in, muted, with a speaker button for sound. It only appears once it's really playing, and stops the moment you move away.
- **Up next**: when the credits roll (taken from the skip data, otherwise the last 30 seconds), a Netflix-style card counts down to the next episode with its thumbnail and title. *Play now*, or *Watch credits* to stay. Pausing the video pauses the countdown. Replaces Stremio's own popup (choose 5–20 seconds, or Off to keep Stremio's).
- **Anime filler guide**: long anime get *Filler* and *Mixed* tags in the episode list, with filler dimmed (community lists from animefillerlist.com, matched strictly by title). **Skip filler** (off by default) lets Up next jump straight to the next canon episode and opens it with the same release, like binge watching.
- **New episode badges** on library shows with an episode you haven't seen since it came out, and an **Airing this week** row on Home with countdowns. Episode lists come from your own metadata addons (Cinemeta, TMDB, Kitsu…), checked every 6 hours.
- **Who's watching?**: add viewers (Netflix-style picker, shown at start once there's more than one). Each viewer has their own watch stats, volume/speed and watch-party name. Library and Continue Watching stay shared, because separate libraries need Stremio's own profiles, which Stremio limits to premium.
- **Your stats** (profile menu): time watched today, this week, month and year, streaks, a 30-day chart, most-watched titles and top genres, favourite time and day. Only time spent actually playing counts.
- **Remember volume & speed** between streams (per viewer). The watch party's small catch-up speed changes are never saved.
- **Keyboard**: 0–9 jump to 0–90% in the player (instead of Stremio switching tabs), and **?** shows every shortcut.
- dx.bi now keeps its own data (viewers, stats, preferences) in `dxbi-data.plugin.json` next to its settings, so it survives Stremio clearing its storage.
- **Theme built in**: the plugin now carries the dx.bi theme and uses it whenever no other theme is applied, so installing the plugin alone gives the whole look. Applying the theme file, or any other theme, takes over from it. The "Use the dx.bi theme?" prompt is gone.
- **One-click Home rows**: a fresh account gets one offer to add the free catalog addons dx.bi's Home uses (TMDB, Streaming Catalogs, Anime Catalogs, TMDB Collections). Also in *Addons → Order & backup*, with Undo.
- **When a video won't play**, dx.bi explains why under Stremio's error (streaming server not running, or a format this computer can't play) with *Pick another stream* and *Open in mpv/VLC* buttons.
- **Subtitles start off** (new setting, like Netflix). Stremio turned them on whenever a subtitle language was set, and Stremio Enhanced's embedded-subtitle loader forced English even when it wasn't.
- **Buffering spinner** in the player instead of the title logo.
- **Watch party**: everyone now hears when someone leaves the movie or comes back, not only when the host leaves. While you're out of what the party is watching, a **Back to …** button brings you straight back in (for the host too).
- **Fixed**: going back to Home (from Settings, Search…) froze the app for over a second; Home also kept doing needless work every fraction of a second while idle. Both gone.
- **Fixed**: *Airing this week* showed a show once per upcoming episode (three Cyberpunks). One card per show now, with "+2 more".
- **Fixed**: playback could freeze on "buffering" with plenty already loaded (a Chromium decoder stall). dx.bi notices and restarts it.
- **Fixed**: right-clicking a stream showed its menu underneath the streams below it.
- **Fixed on Windows**: applying a theme in Stremio Enhanced didn't load until a restart (Windows paths weren't turned into file links).

## 2.8.1
- **Fixed needing to press back twice** after opening a title from a hover card or the billboard. dx.bi now opens titles the same way Stremio's own links do, so the back arrow returns to where you were in one press (Home, Search and Library all checked).
- **Fixed the mouse wheel doing nothing while a hover card was open.** Scrolling over the card now scrolls the page (or the row, when you scroll sideways) and closes the card, like Netflix.

## 2.8.0
- **Everything in one plugin.** Features that used to need separate plugins are now built into dx.bi, written from scratch so nothing clashes:
  - **Skip Intro, Skip Recap, Skip Credits and Next Episode** buttons (Netflix-style, bottom right), with optional auto-skip for intros and recaps, or credits too. Times come from TheIntroDB for movies and series and AniSkip for anime (Kitsu titles are matched to MyAnimeList automatically). No API key and no analytics.
  - **Addon order & backup** on the Addons page: drag (or use the arrows) to reorder your addons, back them up to a file, restore from a backup, and undo the last change. Saved to your Stremio account; dx.bi keeps the previous list so a change can always be undone.
  - **Subtitle styles**: Netflix, bold outline, boxed, classic yellow or soft, plus five fonts. Stremio's own size and position settings still apply, and the styles carry over to the picture-enhancement subtitle layer.
  - **Picture-in-picture** button in the player.
- dx.bi's menus and dropdowns sit above everything on their own, so **Context Menu Fix is no longer needed**.
- If you use TheIntroDB, IntroDB, AniSkip, Stremio Addon Manager, Addon Organizer, Enhanced Video Player, Picture in Picture or Context Menu Fix, turn them off: dx.bi now does the same and you'd get duplicate buttons.

## 2.7.0
- **One-click setup**: on first start with the default look, dx.bi offers to switch on the dx.bi theme (once; it never replaces a theme you picked). The theme now declares the plugin as a requirement, so Stremio Enhanced won't apply it on its own and leave you with half a redesign.
- **Fixed themes only appearing after a restart on Linux and macOS.** Stremio Enhanced's Apply button points the stylesheet at a bare file path, which the app resolves as a web address. dx.bi now corrects the link, so any theme applies instantly.
- **Anime scores on posters and previews.** The Kitsu anime addon passes its own score in the IMDb field, so those badges used to say "IMDb" with a Kitsu number. They're now labelled **Kitsu** (in blue), and anime without any score gets one from Kitsu (kitsu: ids) or AniList (mal: ids), fetched in batches and cached for 3 days.
- **Open in mpv / VLC** button in the player (shown only when one is installed). It pauses Stremio, so your place is kept, and hands the stream to the external player. Handy for files that stutter or won't play in the app. New setting to hide it.
- Steadier access to Stremio's internal state: dx.bi keeps a working handle even on screens where Stremio Web drops `window.core`, so My List, watch party and previews don't silently stop.

## 2.6.0
- **Watch party**: watch in sync with friends. Start a party from the people button, send the code, and everyone's Stremio opens the same title, picking the same release from their own addons and debrid account (matched by torrent hash, then filename, then quality). Shared play, pause and seeking; everyone waits while someone buffers; follows the host to the next episode; chat and reactions. Stream links and API keys are never shared, and everything is end-to-end encrypted with the party code (AES-256-GCM) over public relays, including one on port 443 for strict networks. New settings: watch party on/off, follow the host, chat & activity in the player, sounds.
- **Fixed Anime4K and Sharpen turning the picture upside down** after the first frame. Shader settings carried over from the last step of one frame into the first step of the next, which flipped the picture and also weakened the Sharpen filter after Anime4K had run. Every step now starts from clean settings.

## 2.5.2
- Fixed dropdowns not changing anything when the **Context Menu Fix** plugin is installed: Discover type, catalog and genre, Library type, and the season picker. That plugin shows a copy of each open dropdown. Pressing on the copy made Stremio close the real one before your choice reached it. dx.bi now passes the choice straight to the real option.
- Those dropdown copies now match the width of their button instead of being capped at 125px.

## 2.5.1
- Fixed hover previews not opening when you moved quickly from one open preview to another title. The old card's close was cancelling the new card's open. The current preview now stays up until the next one replaces it, and still closes as soon as you leave the row.

## 2.5.0
- **Seek bar previews now work with real streams.** Most streams play through Stremio's local converter (the player only sees a `blob:` URL), so previews now use the streaming server's own thumbnail endpoint. A coarse-to-fine thumbnail strip builds quietly in the background (pausing while the film buffers), so hovering shows a nearby frame instantly and the exact frame a moment later.
- The preview checks the pointer's real position on every move.
- **Picture enhancement (upscaler)**: real-time WebGL2 processing with a small mpv user-shader runtime running bloc97's **Anime4K** v4 Restore + Upscale CNN shaders (quality and fast), plus AMD-style contrast-adaptive sharpening for live action. Auto picks per title. HDR10 is tone-mapped to match Stremio's own picture, native subtitles are redrawn on top, and it steps down automatically if frames start dropping. ✨ button in the player.

## 2.4.0
- **Seek bar previews**: point at the progress bar to see a thumbnail of that moment and its time, Netflix-style; works while dragging too. Frames are cached and only fetched when the cursor rests, to keep bandwidth low.
- Fixed the seek-bar knob sitting half its width to the right of the true position.
- Lighter fill from the playhead to the cursor; Stremio's small time tooltip is replaced by the preview card.
- **Time remaining**: the player clock counts down by default (click it to switch).
- **Next Episode** button on series, next to the other controls.

## 2.3.0
- **Stream sorting & filters** above every streams list: sort by addon order, best quality, most seeds, largest or smallest; filter by quality, language (from flags and release names), source, provider, ⚡ instant (cached debrid) and HDR/DV. Works with any stream addon, remembers your choices, and never moves Stremio's own elements (uses CSS order), so streams that arrive late slot in correctly.
- README: clear note that DX.BI is a reskin, not a streaming service; linked list of compatible plugins with credits.

## 2.2.1
- Billboard transitions reworked: only the pictures cross-fade; the old title fades out completely before the new one fades in, with no movement — text stays crisp instead of looking washed out mid-change. The outgoing picture keeps its slow zoom until it has faded (no jump).
- Genre / cast / director pills (details page and Discover panel): text is now optically centred.

## 2.2.0
- **New intro**: a pre-rendered cinematic film (logo drop-in → push-in → dive through a 3D tunnel of light ribbons → red light wash) with an original stereo score. Plays on the video decoder, so it's smooth even while the app loads (0 dropped frames in testing). Follows your accent colour; skip with Esc/Enter/click.
- **Interface sounds**: designed, synthesised sounds for tabs, opening titles, previews, My List, player controls, toggles and keyboard navigation, with a volume setting.
- **Works with your addons**: previews, ratings and artwork now come from the metadata your addons already provide (TMDB, anime, streaming catalogs…), with Cinemeta only filling gaps. Rating badges are skipped on posters that already show one (RPDB etc.). My List reflects the real library state.
- **Plugin compatibility**: stream-list plugins (Stream Quality Picker, Stream Keyword Filter, Stream Finder, FilterStreams) stack neatly with the streams panel; Enhanced Video Player's subtitle styling becomes a matching panel; Context Menu Fix no longer inflates the account menu; all skip-intro plugins get matching buttons.
- Billboard keeps rotating while you hover, and resumes cleanly when you come back to Home.
- Performance: removed every endlessly-running animation (static loading placeholders, GPU-only preview zoom); idle CPU on Home ~2% while the billboard animates, zero elsewhere.
- One-line installers for Windows (PowerShell) and Linux/macOS.

## 2.1.0
- Netflix-style animated intro (logo drop-in, push-in, light ribbons), optional synthesized sound.
- Redesigned hover preview: grows out of the poster, Play / My List / More info, rating, length, HD, genres.
- New player: ±10s buttons, centred title, play/pause feedback, dot-style speed picker, three-column subtitles panel with ticks.
- Fixed player menus not closing and the control bar overflowing on wide button sets.
- Settings refresh immediately after an update (no restart needed).
- Bounded metadata cache with expiry; each update step is isolated so one failure can't stop the rest.

## 2.0.0
- First public version: billboard, carousels, IMDb badges, wide Continue Watching, full page restyle.
