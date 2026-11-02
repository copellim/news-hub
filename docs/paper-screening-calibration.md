# Taratura della scrematura metodologica v2

Confronto eseguito il 2 novembre 2026 su sei PDF pubblici già analizzati dalla
versione 1. Il campione è stato scelto per coprire quattro esclusioni e due
selezioni precedenti, includendo il caso in cui l'AI aveva scartato un lavoro
perché non poteva aprire il codice. Non è un campione casuale né una stima
statistica della precisione del filtro.

I PDF completi sono stati rivalutati con Haiku e il prompt v2. Il nuovo prompt
non ha ricevuto il verdetto precedente. Non sono state fornite recensioni
OpenReview aggiuntive e la cache di produzione non è stata sovrascritta durante
il confronto. Sono stati poi controllati nel testo dei PDF i passaggi pertinenti
alle motivazioni dei cambiamenti; questo controllo circoscritto non certifica
la correttezza degli esperimenti o delle dimostrazioni.

| Paper | Prima | Dopo | Controllo dei passaggi rilevanti |
|---|---|---|---|
| [Bayesian Distribution System State Estimation with Flow Matching](https://arxiv.org/abs/2610.40728) | Escluso | Consigliato | Sez. III–V: metodo e configurazioni descritti, split temporale, tuning sulla validazione, confronto con baseline e bootstrap a blocchi. Il PDF indica due repository; la mancata apertura del codice da parte dell'AI non dimostra un difetto del metodo. |
| [More Rules, Longer Lists?](https://arxiv.org/abs/2610.40758) | Escluso | Da valutare | Sez. 4, 6–8: costruzione e certificazione di 20 catene, dipendenza dal modello certificante e sensibilità degli aggiornamenti GEPA. Sono limiti di interpretazione e generalizzazione da leggere, non prova di inutilità. |
| [Beyond Plausible Prediction](https://arxiv.org/abs/2610.40798) | Escluso | Da valutare | Sez. 3, 5–6 e appendici: quota sintetica del TEST esplicitata, controlli sugli split e limiti della valutazione offline; dipendenza da output storici di modelli chiusi. |
| [Automatic Construction of Strong Simple Baselines](https://arxiv.org/abs/2610.40700) | Escluso | Da valutare | Sez. 3–6 e appendici: 36 task, confronto con risultati riportati anziché riesecuzioni a pari budget, limitazioni esplicite. L'evidenza resta pertinente al setup ma non autorizza generalizzazioni senza riserve. |
| [rTaste](https://arxiv.org/abs/2610.40488) | Selezionato | Da valutare | Sez. 3, 6 e appendice B: sette seed paper, assenza di baseline umana, accordo tra auditor limitato su alcune etichette. Il nuovo giudizio conserva il paper rendendo esplicita l'incertezza. |
| [The psychophysics of affect in large language models](https://arxiv.org/abs/2610.40985) | Selezionato | Da valutare | Methods e Discussion: condizioni comparative su due modelli focali, accesso OpenRouter senza snapshot fissi e temperatura effettiva non sempre osservabile. Limiti dichiarati, senza dimostrazione di un difetto sostanziale. |

Esito del confronto: da quattro esclusioni e due selezioni a un consigliato e
cinque da valutare. Tutti e sei rimangono accessibili. Nessun difetto sostanziale
è stato identificato nel campione con i nuovi criteri; non avendo un insieme
validato di paper difettosi, questo confronto non misura il tasso di falsi
negativi delle esclusioni.

I test automatici coprono separatamente i casi di esclusione: ritrattazione e
`fatal` corredato da riferimento ed effetto sulla conclusione centrale. Coprono
anche dati mancanti, limiti, vecchi giudizi v1, influenza limitata della peer
review, alternanza delle fonti e conteggi delle attese. Il criterio non viene
calibrato per ottenere una quota prefissata di consigliati.
