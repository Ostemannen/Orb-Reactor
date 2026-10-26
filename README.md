# ORB REACTOR

**Great games. Fair mechanics. No bullshit.**

ORB REACTOR er en fysikkbasert arkade-roguelite for nettleseren. Du sikter og skyter glødende orber inn i et reaktorkammer fullt av pegs, bumpere, portaler og reaktornoder. Hver stage har et energimål og et begrenset antall skudd. Klarer du målet, velger du én av tre oppgraderinger og går videre. Hvis ikke, er runden over.

Spillet er laget for mobil i portrett først og tilpasser seg desktop.

## Kom i gang

```bash
npm install
npm run dev      # utviklingsserver (http://localhost:5173)
npm run build    # typesjekk + produksjonsbygg til dist/
npm run preview  # server produksjonsbygget lokalt
npm run sim      # hodeløs balansesimulering (se under)
```

Krav: Node 18+ (testet med Node 22).

## Kontroller

| Plattform | Handling |
|---|---|
| Mobil | Dra på kammeret for å sikte, slipp for å skyte. Dra av toppen for å avbryte. |
| Desktop | Musen sikter, klikk og slipp for å skyte. ←/→ eller A/D finjusterer (Shift = ekstra fint), Space/Enter skyter, P/Esc pauser. |
| Under skudd | ⏩ spoler fram lange skudd. Auto-framspoling kan slås på i innstillinger. |

## Spillsløyfen

1. Se energimålet og eventuell stage-modifier.
2. Sikt med siktelinjen (viser banen fram til første treff).
3. Skyt. Hvert treff øker combo, og combo gir multiplikator på energi og score.
4. Treffede pegs fjernes når skuddet er ferdig, slik at nye baner åpner seg.
5. Nå målet før skuddene er brukt opp, og velg 1 av 3 oppgraderinger.
6. Klar 10 stages for å vinne. Deretter kan du ta ut gevinsten eller fortsette i *Endless Overdrive*.

Credits samles under runden og bankes når runden er over, også når du taper. Du får alltid peg-salvage, og hvis du avbryter, beholder du det du har tjent.

## Innhold

- **10 peg-typer:** Standard, Charged, Multiplier, Split, Bomb, Bounce Booster, Portal Pair, Reactor Node, Converter og Shield. Alle er definert i `src/data/pegs.ts`.
- **52 oppgraderinger** i seks kategorier (Orb, Energy, Combo, Split/Chain, Economy, Utility). De er datadrevne og stables additivt (`src/data/upgrades.ts`).
- **5 bygg-arketyper** som vokser fram av synergier: Split, Combo, Bomb, Reactor og Credit. Draft-utvalget vekter tagger du allerede eier.
- **10 stage-modifiers**, blant annet High Voltage, Volatile Core, Tight Reactor, Echo Split, Fragile Grid, Rich Circuit og Overheat.
- **10 sektor-layouter**, med to *Core*-stages (5 og 10) og bevegelige peg-grupper fra stage 4.
- **Moduser:** Standard Run, Daily Reactor (seedet, ett forsøk per dag, ingen lab-kraft), Practice Chamber, samt Hardcore og Chaos Core som låses opp i laben.
- **Reactor Lab:** 15 permanente noder. De fleste låser opp innhold, mens kraftøkningene er bevisst små.
- **28 achievements** som gir credits, kosmetikk og titler.
- **21 kosmetikk-elementer** (6 standard, 6 opptjenbare og 9 i butikken) fordelt på orb, trail, reaktortema, bakgrunn, treffeffekt og UI-aksent.
- **Syntetisert lyd** med Web Audio: treff som stiger i tonehøyde med combo, egne lyder for hver hendelse og tre genererte musikkspor. Ingen lydfiler trengs.

## Rettferdighetsprinsipper

- Kosmetikk endrer bare utseendet. Simuleringen leser aldri kosmetikkdata.
- Butikken har ingen betalingsløsning. Kjøpsknappene er deaktivert med forklarende tekst, og ingenting blir «kjøpt» på liksom. Butikkvarer kan forhåndsvises på brettet.
- Ingen premium-valuta, loot boxes, energisystem, tvungne annonser eller tidspress.
- Daily Reactor slår av lab-kraft, slik at alle spiller på like vilkår.

## Arkitektur

```
src/
  main.ts                    oppstart: Phaser + UI + kontroller
  styles.css                 all UI-styling (mobil først, safe-area)
  data/                      ren data: pegs, upgrades, modifiers, stages,
                             cosmetics, meta (lab), achievements, modes
  state/
    profile.ts               versjonert profil, migrering, sanering, korrupsjonsvern
    ProfileService.ts        lagring, achievements, lab-kjøp, kosmetikk
    run.ts                   run-state og run-persistens
  game/
    config/balance.ts        ALLE balansetall på ett sted
    entities/types.ts        Peg-, Orb- og stage-typer
    systems/
      ReactorSim.ts          deterministisk fysikk + regler (ingen Phaser)
      BoardGenerator.ts      seedet brettgenerering, modifiers
      UpgradeSystem.ts       draft-vekting og byggsammendrag
      RunController.ts       run-livssyklus, belønninger, persistens
      AudioSystem.ts         syntetiserte lydeffekter og musikk
    scenes/
      BoardScene.ts          Phaser-rendering, input, effekter, sikte
      textures.ts            prosedyrisk genererte teksturer
    ui/                      DOM-HUD og skjermer (menyer, draft, lab …)
    utils/rng.ts             seedet PRNG (mulberry32)
scripts/balanceSim.ts        hodeløs balansesimulering
```

**Viktige designvalg**

- `ReactorSim` er ren TypeScript uten renderingsavhengigheter. Den kjører med fast tidssteg (1/240 s) og kan derfor simuleres hodeløst. Scenen leser bare hendelser fra den.
- Phaser tegner kun kammeret. All tekst-UI er DOM, slik at den holder seg skarp, tilgjengelig og responsiv ned til 360 px bredde.
- Brett, modifiers og drafts er seedet per run og stage. Daily-seeden kommer fra datoen.

**Sikkerhet mot fastlåsning og uendelige løkker:** Orber som står stille får et lite dytt. Etter tre dytt fjernes brukte pegs orben sitter fast mot, og etter fem dytt får orben kort «ghost»-modus. Orber har også en maksimal levetid, og splitting er begrenset både i antall orber og i generasjoner.

## Lagring

`localStorage` holder to nøkler:

- `orb-reactor.profile` er versjonert og migreres ved behov. Ugyldige felt saneres mot standardverdier. Ved korrupt JSON tas en kopi til `orb-reactor.profile.corrupt`, og spillet starter med en ny profil i stedet for å krasje.
- `orb-reactor.run` holder pågående runde. Den lagres når et skudd skytes og når det er ferdig, og draft-valg lagres med reroll-teller. En refresh gjenoppretter derfor nøyaktig samme tilstand. Det går ikke an å få tilbake et skudd ved å avslutte midt i det, og det går ikke an å rerolle ved å laste siden på nytt.

## Balansering

`npm run sim` spiller hver stage med to strategier: tilfeldig sikte og «greedy» sikte (beste av seks prøveskudd). Simuleringen rapporterer klarerate, energi per skudd og sekunder per skudd.

- `UP=amplifier,sustain npm run sim` tester et oppgraderingssett.
- `RUNS=40 npm run sim` simulerer hele runder med middels sikte og automatiske valg.

Med dagens tall viser simuleringen dette:

- Tilfeldig sikte klarer stage 1–4 i 94–100 % av tilfellene.
- Uten oppgraderinger stopper det rundt stage 6–8.
- Hele runder med middels sikte vinnes i omtrent 35 % av tilfellene, og de fleste tapene kommer på stage 9–10.

Alle mål og verdier justeres i `src/game/config/balance.ts`, `src/data/stages.ts` og `src/data/pegs.ts`.
