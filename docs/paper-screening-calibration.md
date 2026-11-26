# Calibration of the v2 methodological screening

Comparison run on 2 November 2026 on six public PDFs already analysed by
version 1. The sample was chosen to cover four previous exclusions and two
previous selections, including the case in which the AI had discarded a work
because it could not open the code. It is neither a random sample nor a
statistical estimate of the filter's precision.

The full PDFs were reassessed with Haiku and the v2 prompt. The new prompt
did not receive the previous verdict. No additional OpenReview reviews were
supplied and the production cache was not overwritten during the comparison.
The passages relevant to the reasons for the changes were then checked in the
text of the PDFs; this limited check does not certify the correctness of the
experiments or the proofs.

| Paper | Before | After | Check of the relevant passages |
|---|---|---|---|
| [Bayesian Distribution System State Estimation with Flow Matching](https://arxiv.org/abs/2610.40728) | Excluded | Recommended | Sec. III–V: method and configurations described, temporal split, tuning on validation, comparison with baselines and block bootstrap. The PDF points to two repositories; the AI failing to open the code does not show a flaw in the method. |
| [More Rules, Longer Lists?](https://arxiv.org/abs/2610.40758) | Excluded | To review | Sec. 4, 6–8: construction and certification of 20 chains, dependence on the certifying model and sensitivity of the GEPA updates. These are limits of interpretation and generalisation to be read, not proof of uselessness. |
| [Beyond Plausible Prediction](https://arxiv.org/abs/2610.40798) | Excluded | To review | Sec. 3, 5–6 and appendices: synthetic share of the TEST made explicit, checks on the splits and limits of the offline evaluation; dependence on historical outputs of closed models. |
| [Automatic Construction of Strong Simple Baselines](https://arxiv.org/abs/2610.40700) | Excluded | To review | Sec. 3–6 and appendices: 36 tasks, comparison with reported results rather than reruns at equal budget, explicit limitations. The evidence remains relevant to the setup but does not license unqualified generalisations. |
| [rTaste](https://arxiv.org/abs/2610.40488) | Selected | To review | Sec. 3, 6 and appendix B: seven seed papers, no human baseline, limited agreement between auditors on some labels. The new verdict keeps the paper while making the uncertainty explicit. |
| [The psychophysics of affect in large language models](https://arxiv.org/abs/2610.40985) | Selected | To review | Methods and Discussion: comparative conditions on two focal models, OpenRouter access without fixed snapshots and effective temperature not always observable. Declared limits, with no demonstration of a substantive flaw. |

Outcome of the comparison: from four exclusions and two selections to one
recommended and five to review. All six remain accessible. No substantive flaw
was identified in the sample with the new criteria; lacking a validated set of
flawed papers, this comparison does not measure the false-negative rate of the
exclusions.

The automated tests cover the exclusion cases separately: retraction and
`fatal` backed by a reference and an effect on the central conclusion. They
also cover missing data, limitations, old v1 verdicts, the limited influence of
peer review, alternation of sources and pending counts. The criterion is not
calibrated to obtain a predetermined share of recommended papers.
