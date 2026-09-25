# Opus 5.5: five reasoning levels, one game prompt

Play the six browser strategy games from the video, inspect their source, and copy the prompts used to generate them.

**Download or fork this repository and run it on your own computer.** GitHub Pages is disabled; there is no hosted playable site.

[Original prompt](prompts/original.txt) · [Special Build prompt](prompts/special-build.txt)

The first five runs used the same prompt in separate, fresh Claude Code projects with Low, Medium, High, X High and Max effort. The sixth used **Low** with a more detailed prompt based on observations from the earlier builds. These are experimental AI-generated games with the strengths and bugs shown in the video.

## Play on your own computer

After starting the local server below, choose a build from the local index. Desktop keyboard and mouse recommended. No login, AI account, API key or paid service is needed to play. These are static HTML/CSS/JavaScript games; no AI calls run during gameplay. Audio activates after a click. Some builds use browser storage for settings/maps; the Special Build also uses browser speech synthesis, whose voices depend on your browser and OS.

Install Python 3 if needed. Download **Code → Download ZIP** and extract it, or fork this repository and clone your fork. Open a terminal in the extracted/cloned repository folder and run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

On Windows, use `py -m http.server 8000 --bind 127.0.0.1` if needed. Open `http://127.0.0.1:8000` in your browser. This address belongs to your own computer; the server is bound to loopback only. Stop it with Ctrl+C when finished. No npm install or build step is required. Use a web server rather than double-clicking game files because several builds use JavaScript modules.

## Recorded results

| Build | Recorded elapsed time | Total tokens | Estimated token cost |
|---|---:|---:|---:|
| [Low](games/low/) | 19m 10s | 3,140,950 | $3.79 |
| [Medium](games/medium/) | 36m 35s | 11,131,202 | $9.25 |
| [High](games/high/) | 1h 00m 33s | 30,665,190 | $16.11 |
| [X High](games/xhigh/) | 1h 45m 51s | 79,623,100 | $35.26 |
| [Max](games/max/) | 2h 58m 27s | 173,338,200 | $69.14 |
| [Special Build (Low)](games/special/) | 1h 23m 06s | 21,005,436 | $13.57 |

Costs are API-equivalent estimates reported during the runs, not subscription charges. Total tokens include input, output, cache reads and cache writes; the underlying displayed token categories were rounded, so totals are approximate. Elapsed time is the recorded prompt-to-completion/session measurement, not pure model execution speed. Permission waits and interruptions can affect it; the Special Build includes a sleep interruption. [results.json](results.json) includes API time separately.

## Original prompt

> Build a complete, polished, playable browser clone of Age of Empires II. Capture the experience of growing a medieval settlement, developing its economy, advancing through ages, building an army and defeating a computer-controlled rival. Make the implementation decisions yourself. Prioritize an enjoyable game, strong visual presentation and systems that work together. Test it yourself before finishing, and leave it running so I can play it.

## How the comparison was set up

1. Install and sign in to Claude Code using your own account. The recorded run used CLI **2.1.281**, model identifier `claude-opus-5-5`, and included subscription allowance. Availability and CLI options may differ in your installation; these are the commands recorded for this experiment.
2. Make a separate empty project folder for each effort level. Start a fresh session inside each folder. Do not put previous builds into these folders.
3. Launch the CLI with the model and effort explicitly selected. Example for Low:

```sh
mkdir -p experiment/low
cd experiment/low
claude --safe-mode --model claude-opus-5-5 --effort low
```

4. Before submitting the prompt, check `/status`, `/effort status` and `/usage`. Confirm the selected model/effort and your own account limits. The recorded setup cleared API-key/base-URL overrides and used subscription login with paid overage credits disabled. Safe mode was used to avoid inherited memories, instructions, hooks and plugins; it is not a guarantee of OS-level isolation.
5. Paste the [original prompt](prompts/original.txt) unchanged. Allow the normal local tool permissions needed to implement and test the game. Let the run finish before reviewing the output. No external corrective implementation prompts were added to the first five runs; the model could still self-test, fix its own work, and use its own agent workflow.
6. Repeat from fresh folders/sessions using `--effort medium`, `--effort high`, `--effort xhigh`, then `--effort max`. Record the prompt start and completion times, plus usage after completion. Avoid counting later idle review time as build time.

The published `games/` folders contain finished outputs for playing and inspection. To repeat the experiment, generate into **new empty folders**, not into these finished games.

## Special Build: detailed prompt, Low effort

After reviewing the five builds, the extra brief combined what worked, what did not, and missing features: wildlife, naval gameplay, unit speech, richer setup options, a map editor, a larger economy/technology tree, animation, cheats, garrisoning, monks/relics, diplomacy/trade, elevation and connected-system testing.

**[Read/copy the complete special prompt](prompts/special-build.txt)**. Its original opening is unchanged; fourteen sections of requirements follow it. Run it in a sixth fresh folder with `--effort low`. No earlier game source or reference images were provided to that run. The same session was resumed after a computer-sleep interruption without changing the requirements.

## What is in this repository

- `games/low`, `medium`, `high`, `xhigh`, `max`, `special`: six static playable builds.
- `prompts/`: the exact original prompt and the final submitted special prompt.
- `results.json`: the comparison metrics.
- `export-manifest.json`: hashes and export changes for the game files.

Gameplay source is preserved. The only changes inside the exported games remove external Google Fonts links so the pages use their existing system-font fallbacks. The visual font may therefore differ slightly from the recording. Original local server helpers were unnecessary and are excluded.

Only selected game source, prompts and summarized metrics were exported. Local paths, session/configuration files, credentials, personal logs, screenshots and prior Git history are not included. Publication uses a fresh history and a GitHub no-reply author email.

## Scope

This is an independent experiment inspired by Age of Empires II, not the original game or an official Microsoft/World's Edge release. The prompt describes intended features; it does not certify that every feature works. This is a comparison of these individual runs, not a controlled statistical benchmark. Desktop launch smoke checks are not full campaign playtests.
