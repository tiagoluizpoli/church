# Research: Face recognition to de-duplicate Children

Researched 2026-11-23. Status: research only, no decision taken. Companion to `docs/research/lgpd-children-data.md`.
This is not legal advice. Numbers are from the cited sources; anything marked **inference** is mine.

Question: when a Guardian registers a Child from a phone browser, can a 1:N face search against the Children already linked to the same Church (hundreds to low thousands) tell whether that Child is already registered by another Guardian? Photos would come from different parents, different phones, possibly years apart. Proposed engines: AWS Rekognition or an open-source model. Current fallback: exact normalized full name + birth date, then the existing Guardians approve a join request.

## 0. Summary and verdict

| Question | Finding |
|---|---|
| Accuracy under 5 | Poor. Ages 0-3, same child 0-4 months apart: 27-31% TAR at 0.1% FAR (0-6 months) up to 62-65% (2.5-3 years); falls to 13-51% at a 20-24 month gap (Hossain et al. 2025, 30 subjects). Best-Rowden et al. 2016 (0-4 years, 314 subjects): 47.93% TAR at 0.1% FAR over 6 months. |
| Accuracy 3-14 | Usable for short gaps in controlled photos: MagFace 98.2% TAR at 0.1% FAR (6 months) to 94.9% (36 months), DSLR studio images (Bahmani and Schuckers 2022). Older matchers on uncontrolled images: 81.9-83.8% at 1 year, 49.3-59.8% at 3 years (Deb et al. 2018). |
| False matches | NIST IR 8280: false positives are elevated in children, worst in the youngest. For one algorithm at a threshold giving FMR 1e-4 overall, same-sex imposters aged 0-4 matched at FMR 1e-2 (100x worse) and aged 4-10 at about 3e-3. |
| 1:N at ~1000 Children | With those rates, most searches for a toddler return at least one wrong candidate, and the right candidate is missed more often than found once the photos are a year or more apart (section 1.4). |
| Rekognition | Available in sa-east-1. Cost is negligible at this scale (about US$0.002 per registration, US$0.01/month per 1000 stored faces). Terms require biometric notice and consent naming AWS, and by default let AWS use the content to improve the service unless opted out. |
| Open source | No production-licensed model is shown to work on young children. InsightFace pretrained models are non-commercial only; dlib's model is public domain but its maintainers say it "does not work very well on children". |
| LGPD | Face templates are biometric, so sensitive (art. 5 II, art. 11), of children (art. 14), and the processing meets ANPD's "alto risco" criteria. A required photo for face matching conflicts with art. 14 §4. ANPD in 2026 ordered Paraná to suspend face recognition of pupils because less invasive means existed (Nota Técnica 4/2026). |

**Verdict.**
- **MVP: not viable.** It would not decide correctly for the under-5s, who are a large share of the nursery and the hardest to tell apart; it adds sensitive-data, high-risk processing of children, and a required photo would breach art. 14 §4. The name + birth date match with Guardian approval is the less invasive means ANPD expects to see used first.
- **Post-MVP: viable at most as an opt-in assist that suggests, never decides,** limited to Children old enough for the models to work (roughly 5+, see 1.2), only after a RIPD and a lawyer's opinion on the legal basis, and only if real data shows duplicates that the name/birth-date path misses. Even then its likely gain over fuzzy name + birth date matching is small; measure that gap before paying the legal cost.
- **Never as the only gate** (auto-merge or auto-reject). Both error types are common enough to wrongly join a Child to a stranger's Family or to create a duplicate, and art. 20 gives the Guardian the right to contest a decision made solely by automated processing.

## 1. Accuracy for children

### 1.1 Infants and toddlers (0-4)
- **Hossain, Sumi, Schuckers, "Evaluating Deep Learning-Based Face Recognition for Infants and Toddlers", IJCB 2025, arXiv:2601.01680** (https://arxiv.org/html/2601.01680v1). 30 subjects aged 0-3 at enrolment, 630 images, 7 sessions over 24 months. TAR at 0.1% FAR, Table 1, best model (MagFace):

  | Age at enrolment | gap 0-4 mo | 8-12 mo | 12-16 mo | 20-24 mo |
  |---|---|---|---|---|
  | 0-6 months | 30.7 | 25.3 | 20.7 | 14.9 |
  | 1.0-1.5 years | 43.3 | 41.0 | 34.6 | 29.5 |
  | 2.0-2.5 years | 58.4 | 58.5 | 52.3 | 46.1 |
  | 2.5-3.0 years | 64.7 | 64.1 | 58.1 | 51.1 |

  FaceNet, ArcFace and CosFace are within a few points. Conclusion quoted: "face recognition for children under six months remains highly unreliable". Small sample (30 children): treat the numbers as indicative.
- **Best-Rowden, Hoole, Jain, "Automatic face recognition of newborns, infants, and toddlers: a longitudinal evaluation", BIOSIG 2016, LNI P-260 pp. 87-98** (https://dl.gi.de/items/671b0976-9de5-48a4-b27d-5e3b79951cf0). 314 subjects aged 0-4, up to one year apart. I could not extract the PDF text; the figure is as reported by Deb et al. (1.3): TAR 47.93% at 0.1% FAR at a 6-month gap. That paper suggested longitudinal recognition "may be feasible" only for faces enrolled at about 3 years or older.

### 1.2 Older children (3-14) and template ageing
- **Bahmani and Schuckers, "Face Recognition In Children: A Longitudinal Study", arXiv:2204.01760, 2022** (https://ar5iv.labs.arxiv.org/html/2204.01760). Young Face Aging (YFA): 231 subjects aged 3-14, 2,293 images every 6 months over 3 years, DSLR, consistent indoor light, near-frontal. Table III, TAR:

  | Matcher | FAR | 6 mo | 12 mo | 24 mo | 36 mo |
  |---|---|---|---|---|---|
  | MagFace | 0.1% | 98.2 | 98.3 | 97.2 | 94.9 |
  | MagFace | 0.01% | 96.9 | 95.2 | 91.6 | 84.7 |
  | ArcFace | 0.1% | 87.6 | 88.1 | 84.8 | 81.1 |
  | FaceNet | 0.1% | 95.8 | 94.8 | 84.3 | 76.0 |

  Scores decline significantly with the age gap for every matcher, even at 6 months. Authors' conclusion: recognition "may be feasible for children for age-gaps of up to three years". No per-age-band breakdown is given.
- **Deb, Nain, Jain, "Longitudinal Study of Child Face Recognition", arXiv:1711.03990** (https://ar5iv.labs.arxiv.org/html/1711.03990). CLF dataset: 919 children aged 2-18, 3,682 uncontrolled images over up to 6 years. TAR at 0.1% FAR, 1 year / 3 years: COTS-A 81.94 / 49.33, FaceNet 83.77 / 59.80, fused 90.18 / 73.33. At 0.01% FAR, 1 year: 64.5-80.6. About 80% of children recognisable at 0.1% FAR for about 2.5 years. These are 2017-era matchers.
- **Phone photos taken by parents are closer to CLF than to YFA.** AWS's own service card says error rates rise with lighting, pose, blur, occlusion and resolution differences, and recommends a passport-style frontal photo when only one image per person exists (section 2). **Inference:** expect results nearer the CLF/uncontrolled numbers than the YFA studio numbers.

### 1.3 False matches in children (NIST)
- **NIST IR 8280, "FRVT Part 3: Demographic Effects", Grother, Ngan, Hanaoka, December 2019** (https://nvlpubs.nist.gov/nistpubs/ir/2019/NIST.IR.8280.pdf). Executive summary: "We found elevated false positives in the elderly and in children; the effects were larger in the oldest and youngest, and smallest in middle-aged adults." Under-12 data comes from visa photos (high quality). Figure 15, algorithm imperial_002, threshold set to FMR 1e-4 over all imposter pairs: same-sex imposters both aged (0,4] give log10 FMR = -2.0 (FMR 1%); both aged (4,10] give -2.5 (about 0.3%). Comparisons across distant age groups are far lower. Annex 10 has the same figure for all algorithms (not read). The report also cites Michalski et al. 2018 for similar child false-positive results with a commercial algorithm, and notes young children may give photographs "ill-suited to face recognition".
- NIST stopped running the visa benchmark for 1:1 in March 2024 (FRTE 1:1 page, https://pages.nist.gov/frvt/html/frvt11.html, as summarised by search); I found no newer NIST table of FMR for under-5s. Algorithms have improved since 2019, so current FMRs are likely lower; how much lower for toddlers is not published. NIST IR 8525 (May 2024) covers age estimation, not matching.
- **Twins and siblings.** AWS service card: "matching between identical twins is substantially harder than matching between fraternal twins or unrelated individuals", and the service "cannot simultaneously have very high sensitivity to small differences between different individuals (such as identical twins) and have very low sensitivity to confounding changes". Siblings are exactly the look-alikes a Family registers, and NIST IR 8280 reports FMR is higher within the same age group and sex.

### 1.4 What that means for a gallery of ~1000 Children (inference, arithmetic on the numbers above)
Search scoped to one Church; assume 300 Children aged 0-4 and 300 aged 5-10, half of each sex.
- **False candidates.** With the 2019 NIST child FMRs at a threshold that is 1e-4 for adults: a toddler search meets about 150 same-sex toddlers at FMR 0.01, so about 1.5 wrong candidates per search and P(at least one) = 1 - 0.99^150 ≈ 78%. For a 5-10 year old: 150 x 0.003 ≈ 0.5 wrong candidates, P ≈ 38%. Even if current algorithms are 10x better, about 14% and 5%. Siblings in the same Church make this worse.
- **Missed duplicates.** If the first photo of a 1-year-old is a year old when the second Guardian registers, the right child scores above a 0.1% FAR threshold about 37-41% of the time (Hossain Table 1, 8-12 month gap). For 3-14 year olds at a 1-3 year gap: about 49-98% depending on matcher and photo quality.
- Lowering the threshold to catch more true duplicates raises false candidates; raising it misses more. There is no setting that is both reliable and selective for under-5s.
- The name + birth date path has the opposite profile: it misses only when a Guardian types the name or date differently, and its false positives (two different children with the same name and birth date in one Church) are rare. **Inference:** adding fuzzy name matching (accent folding, token order, nicknames) plus exact birth date covers most of what face matching would add for older Children, with no biometric data.

## 2. AWS Rekognition

- **Capability.** Collections hold face vectors, not images; `IndexFaces` adds a face, `SearchFacesByImage` detects the largest face in the probe image and returns matches ordered by similarity, default `FaceMatchThreshold` 80, `MaxFaces` up to 4096, optional `QualityFilter` (https://docs.aws.amazon.com/rekognition/latest/APIReference/API_SearchFacesByImage.html). Up to 20 million faces per collection; minimum face 40x40 px in a 1920x1080 image; max 5 MB raw bytes (https://docs.aws.amazon.com/rekognition/latest/dg/limits.html). One collection per Church fits the tenancy scope (**inference**).
- **Region.** sa-east-1 (São Paulo) is listed for Rekognition Image, with a default 5 TPS for `IndexFaces`/`SearchFacesByImage` there (https://docs.aws.amazon.com/general/latest/gr/rekognition.html). So vectors can stay in Brazil, subject to the training clause below.
- **Cost.** Pricing page (https://aws.amazon.com/rekognition/pricing/): Group 1 APIs (`IndexFaces`, `SearchFacesByImage`, `CompareFaces`) US$0.0010 per image for the first million; face vector storage US$0.00001 per face per month; free tier 1,000 Group 1 images and 1,000 stored faces per month for 12 months. The page does not show a sa-east-1 rate card; São Paulo prices may differ (not checked). **Inference:** one registration = one search + one index = about US$0.002; 50 Churches x 1,000 Children stored = about US$0.50/month. Cost is not the constraint.
- **Service card** (https://docs.aws.amazon.com/ai/responsible-ai/rekognition-face-matching/overview.html, release as of 2024-10-30): Rekognition "does not independently decide" a match; the customer sets the threshold or uses human judgement; suggests about 95 for identity verification and about 80 for media use; recommends customers test on their own content; recommends human review for decisions that affect an individual's rights. No age or child breakdown is published; the only demographic figures (iBeta, threshold 95) are by skin tone and sex on high-quality ID images.
- **Service terms** (https://aws.amazon.com/service-terms/):
  - 50.3: for Rekognition, by default AWS "may use and store AI Content ... to develop and improve" the service and may store it outside the region used. Opt-out is via an AWS Organizations AI services opt-out policy. Must be set for children's data.
  - 50.9.2: AWS processes face vectors as processor, stores and searches them "only at your direction", not for other purposes.
  - 50.9.3 and the Biometric Notice and Consent Terms (https://aws.amazon.com/legal/biometric-notice-and-consent-terms/, updated 2026-11-19): the customer must give legally adequate notice to data subjects, obtain consents "including informed written consent and explicit consent, where required", identify AWS as service provider, prove consents on request, delete biometric data when the law requires, and indemnify AWS. Those terms do not mention minors; the only children clause in section 50 is for Amazon Lex (COPPA).
  - 50.8 and 50.9.1: law-enforcement restrictions and the police moratorium; not relevant here.

## 3. Open-source options

| Option | Licence of what you would ship | Children | Notes |
|---|---|---|---|
| InsightFace (ArcFace, buffalo_l) | Code MIT; training data "and the models trained with these data" are "for non-commercial research purposes only"; commercial use of `buffalo_l` needs a licence from recognition-oss-pack@insightface.ai (README, https://github.com/deepinsight/insightface) | Same model family as ArcFace rows in 1.1-1.2 | A SaaS sold to churches is commercial: the pretrained weights cannot be used without buying a licence. |
| DeepFace (serengil) | Wrapper MIT; "License types will be inherited" from each wrapped model (VGG-Face, FaceNet, ArcFace, Dlib, SFace, GhostFaceNet, Buffalo_L...); check each model and its training data (README, https://github.com/serengil/deepface) | Inherits each model's behaviour | Not a model itself; licence work moves to the chosen backend. |
| dlib / face_recognition | dlib ResNet model released "into the public domain"; trained on about 3 million faces of 7,485 identities (FaceScrub, VGG, scraped) (https://github.com/davisking/dlib-models). The 68-point landmark model's training data "excludes commercial use" | face_recognition README: "trained on adults and does not work very well on children. It tends to mix up children quite easy using the default comparison threshold of 0.6" (https://github.com/ageitgey/face_recognition) | Cleanest licence, worst fit for children. |

- None of these publishes child-specific accuracy beyond the papers in section 1, all of which show the same steep drop under 5.
- **Hosting (inference, not measured):** registrations are rare (one per Child), so a CPU worker beside the existing server would handle the load; the real costs are licence, building a vector index and deletion, model updates, and owning a biometric store in-house instead of with a processor.

## 4. Legal (LGPD, ANPD)

Text: Lei 13.709/2018, https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm. See `lgpd-children-data.md` for art. 14 detail.
- **Biometric = sensitive.** Art. 5 II lists "dado genético ou biométrico, quando vinculado a uma pessoa natural" as sensitive. A plain photo used for visual identification by a volunteer is personal data of a child (art. 14); once the system extracts a face template to match people, that processing is biometric (**inference**, consistent with how ANPD treats facial recognition technology in NT 4/2026 and NT 5/2025).
- **Legal basis.** Art. 11 I: consent "de forma específica e destacada, para finalidades específicas" by the data subject or legal guardian, plus art. 14 §1 specific, highlighted consent by a parent. Art. 11 II g allows processing without consent for "garantia da prevenção à fraude e à segurança do titular, nos processos de identificação e autenticação de cadastro em sistemas eletrônicos"; whether de-duplicating a Child's registration fits that is a lawyer question, and the art. 14 best-interest test still applies. Legitimate interest is not available for sensitive data (art. 11 has no such basis).
- **Required photo vs art. 14 §4.** Controllers "não deverão condicionar a participação" of children in games, apps or other activities on data beyond what is strictly necessary for the activity. A child can be checked in and safely handed back without a face template, so making a face-matched photo a condition of registering the Child conflicts with §4 and with necessity (art. 6 III). An optional photo for volunteer visual identification, with its own consent, is a different, lower-risk case.
- **High risk.** Resolução CD/ANPD nº 2/2022 art. 4 (https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022): high risk = at least one general criterion (large scale; or may significantly affect fundamental rights) plus one specific criterion (emerging or innovative technology; solely automated decisions; sensitive data or data of children). Face templates of children meet two specific criteria by themselves; across a multi-church SaaS, scale is plausible. High risk removes small-agent relief (DPO exemption, doubled deadlines). Art. 38 lets ANPD require a RIPD; plan to write one.
- **ANPD precedent, Nota Técnica nº 4/2026/CPDP/CGF/SFI/ANPD** (process 00261.007049/2024-06, Paraná state education secretariat, facial recognition for pupil attendance; PDF https://www.gov.br/anpd/pt-br/centrais-de-conteudo/documentos-tecnicos-orientativos/nota_tecnica_4_versao_publica-educacao_parana.pdf/@@display-file/file). Findings: processing children's biometrics was "desnecessário, desproporcional e excessivo" given "meios menos invasivos" with similar results (6.1.2); the RIPD did not show mitigation of "riscos elevados associados ao reconhecimento facial de crianças e adolescentes", including "a confiabilidade e não discriminação do algoritmo, a avaliação de alternativas menos invasivas" (6.1.3); no evidence of best interest (6.1.4, art. 14 caput). It classed the processing as high risk under Res. 2/2022 art. 4 (5.9) and recommended immediate suspension (6.2.1). It quotes Nota Técnica nº 5/2025/FIS/CGF/ANPD (football stadium biometrics including minors): "devem ser priorizados sempre os meios menos invasivos" and child biometric registration "se mostra desnecessário, tendo em vista a existência de alternativas menos invasivas".
- **Automated decisions.** Art. 20: right to request review of decisions "tomadas unicamente com base em tratamento automatizado". Auto-merging or auto-rejecting a Child on a face score would be such a decision.
- **Processor terms.** Using Rekognition adds AWS as operator: the consent text must name it (AWS biometric terms), the 50.3 training opt-out must be on, and international storage under 50.3(c) must be excluded or covered as an international transfer.

## 5. What would change the verdict

- Published, current child-specific results (for example a NIST FRTE table by age under 5 on phone-quality images) showing FMR near adult levels.
- Measured duplicates in production that the name + birth date + fuzzy-match path misses, large enough to justify a RIPD.
- A lawyer's opinion that art. 11 II g or consent supports the purpose, and a design where face matching is opt-in, limited to older Children, deletes templates on Guardian request and after the purpose ends, and only shows candidates to the existing Guardians.

## Not checked
- Best-Rowden 2016 full text (PDF not extractable; figure taken from Deb et al.); Michalski et al. 2018; NIST IR 8280 Annex 10 (all algorithms) and any newer NIST child-ageing report.
- Rekognition prices specific to sa-east-1; AWS AUP beyond the service terms.
- ANPD Radar Tecnológico nº 2 (biometrics, June 2024) and the biometrics regulation on the 2025-2026 regulatory agenda (known only from search summaries).
- Exact consolidated wording of art. 5 II read from Planalto (quoted from the statute as commonly published; the page fetch truncated it).
