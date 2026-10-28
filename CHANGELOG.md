# Changelog

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
