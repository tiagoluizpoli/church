# LGPD and children's data for Kids check-in

Research for issue #1076 (map #1072, Kids check-in and parent paging). Researched 2026-11-23.
This is not legal advice. It lists constraints the specs must obey and the points a lawyer must confirm.

## Sources (primary)

- LGPD, Lei 13.709/2018, consolidated text: <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm>
- ANPD, Enunciado CD/ANPD nº 1, 22 May 2023 (published 24 May 2023): <https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes>. The wording below is quoted from ANPD's own Legítimo Interesse guide (Feb 2024): <https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf/@@display-file/file>. I could not open the Enunciado PDF itself.
- Resolução CD/ANPD nº 15, 24 Apr 2024 (incident notification), DOU 26/04/2024, seção 1, p. 114. I read a copy of the DOU PDF hosted at lgpd.ms.gov.br, not the in.gov.br original.
- Resolução CD/ANPD nº 2, 27 Jan 2022 (small-scale agents): <https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022>
- ECA, Lei 8.069/1990, arts. 2, 17, 18: <https://www.planalto.gov.br/ccivil_03/leis/l8069.htm>
- Lei 14.534/2023 (CPF as single number in public-service databases): <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14534.htm>

## Findings

### Who is a child
ECA art. 2: "criança" is a person up to 12 years incomplete. LGPD art. 14 §1 (specific parental consent) applies to "crianças" only; adolescents (12-17) fall under the caput (best interest) and general bases.

### Art. 14 (verbatim points)
- Caput: processing of children's and adolescents' data "deverá ser realizado em seu melhor interesse".
- §1: children's data needs "consentimento específico e em destaque dado por pelo menos um dos pais ou pelo responsável legal".
- §2: controllers must keep public "os tipos de dados coletados, a forma de sua utilização e os procedimentos para o exercício dos direitos" of art. 18.
- §3: collection without §1 consent is allowed only "quando a coleta for necessária para contatar os pais ou o responsável legal" (used once, no storage) "ou para sua proteção", and never passed to a third party without consent.
- §4: do not condition participation on data "além das estritamente necessárias à atividade".
- §5: "todos os esforços razoáveis para verificar" that consent came from the child's guardian, given available technology.
- §6: information must be simple, clear and accessible, with audiovisual resources where suitable, adequate for the parents and the child.

### Lawful basis: consent is not the only one
Enunciado nº 1/2023: children's and adolescents' data "poderá ser realizado com base nas hipóteses legais previstas no art. 7º ou no art. 11 da LGPD, desde que observado e prevalecente o seu melhor interesse, a ser avaliado no caso concreto, nos termos do art. 14".
Legitimate interest (art. 7 IX) needs a recorded balancing test showing (i) what was taken as the child's best interest, (ii) the criteria used to weigh it, (iii) no disproportionate risk; if inconclusive, use another basis (ANPD Legítimo Interesse guide). The guide says it fits best where there is a prior direct relationship and the processing protects the child or delivers a service benefiting them. The guide also says legitimate interest cannot be used for sensitive data.
In practice: safety/identity data needed to hand a child to the right adult can rest on art. 7 IX or art. 14 §3 "proteção", but the safe design is still explicit guardian consent at registration (art. 14 §1), since consent is documentable and the church has a direct guardian relationship. Whether the church may rely on art. 7 IX or §3 alone is a lawyer question.

### Sensitive data risk (religion)
Art. 5 II lists "convicção religiosa" as sensitive; art. 11 §1 extends the regime to any processing that reveals sensitive data. A child's membership in a church's children's ministry can reveal religious conviction, and health notes (allergies, medication) are health data. Art. 11 lists no legitimate-interest basis; specific consent (art. 11 I) or the art. 11 II bases (e.g. protection of life, 11 II e; health care by health professionals, 11 II f) apply. Treat allergy/medical fields as sensitive and consent-gated.

### Minimisation and CPF
Art. 6 III (necessidade), art. 14 §4 and the ANPD guide ("mínimo necessário") all point the same way. Nothing in the LGPD requires a child's CPF, and Lei 14.534/2023 only makes CPF the identification number for public-service databases, so it gives a private church no reason to collect it.
Check-in needs: a name, an age band, the guardian link, a pickup code, allergy flags. A child's CPF is not necessary for any of these. De-duplication can use name + birth date + guardian, with a human merge step.
If a CPF is ever kept (for example a guardian's, for a legal reason), store it encrypted or as a keyed hash (HMAC with a secret in server config; plain hash of a CPF is trivially reversible because the space is about 10^9). A keyed hash supports de-duplication but not display, which also limits harm in a breach. Whether a keyed hash still counts as personal data is a lawyer question; assume it does.

### Photos
A child's photo is personal data of a child (art. 14). ECA art. 17 protects "imagem" as part of the right to respect. Face recognition would be biometric, hence sensitive (art. 5 II). Use a photo only if it does a job (volunteer-verified identification at pickup) and guardian consent names that purpose. Separate consent for publishing images (newsletter, social media) is needed; never bundle it with check-in.

### Access, security, accountability
Art. 6 VII, 46 and 49 require security measures and systems structured to meet them. Art. 6 X requires demonstrable compliance; art. 37 requires a record of processing operations. Volunteers should see only what their role needs (roster, allergy flag, pickup code), not guardian contact or address history. Log access to child records.

### Retention
Art. 15-16: data ends when the purpose ends and must then be deleted, except for legal duty, research (anonymised), transfer, or the controller's exclusive use after anonymisation. No source gave a fixed retention period for church child records; the spec must define one.

### Data subject rights
Art. 18: access, correction, anonymisation/blocking/deletion, deletion of data processed on consent, revocation of consent. The guardian exercises them for a child. A "withdraw consent / delete child" action must exist and must cover photos and medical notes.

### Breach duties
Resolução 15/2024: art. 4 notify ANPD and the data subject when an incident may cause relevant risk or damage; art. 5 II lists "dados de crianças, de adolescentes ou de idosos" as a criterion (together with significant effect on rights, art. 5 caput) and art. 5 I lists sensitive data. Deadline: three business days from knowledge (art. 6 caput; art. 9 for subjects). The notice must state the number of children affected (art. 6 §2). Art. 10: keep an incident record, including incidents not notified, for at least five years. Small-scale agents get double deadlines (art. 6 §6).

### Small-scale agent status
Resolução 2/2022 arts. 2-4: non-profit private legal entities can be small-scale agents, but "alto risco" excludes them when processing is large scale and also uses sensitive or children's data. The church may or may not qualify; this affects the DPO (art. 41) exemption and the doubled deadlines. Even if exempt, a channel for data subjects is required. Lawyer question.

## Constraints for the specs

1. Collect only: child name, birth date (or age band), guardian link, allergy/medical flag, pickup code. No child CPF, no RG, no address.
2. Guardian consent is recorded at registration: specific, highlighted (art. 14 §1), versioned text, timestamp, who gave it, and a per-purpose toggle for photo and for medical notes. Reasonable verification that the signer is the guardian (art. 14 §5), for example an in-person check on first visit or a one-time code to the guardian's phone.
3. Photo is optional, used only for pickup verification, never published; publication consent is separate.
4. Medical notes are sensitive: separate field, explicit consent, visible only to the room's volunteers on a need basis.
5. A public privacy notice in plain language lists data types, use and art. 18 procedure (art. 14 §2, §6), with a child-friendly version.
6. Role-based access with the minimum view for volunteers; every read of a child record is logged.
7. Retention rule defined per field (propose: delete the child and pickup data N months after the last attendance, or on guardian request); a deletion job and a "delete this child" action.
8. Any CPF kept (guardian, if ever) is encrypted or HMAC-hashed with a server secret, never logged, never in URLs or exports.
9. Incident runbook: three-business-day clock from awareness, count of affected children, five-year incident register.
10. No participation condition tied to extra data (art. 14 §4): a child can attend with the minimum set.
11. Record processing operations (art. 37) and a balancing test if any step relies on legitimate interest.

## Needs a lawyer

- Whether the church is a small-scale agent or "alto risco", and the DPO requirement.
- Whether art. 7 IX or art. 14 §3 can replace consent for pickup safety, versus mandatory consent.
- Whether the children's-ministry data counts as religious-conviction data in practice.
- Retention periods, including any civil-liability reason to keep attendance records.
- Whether a keyed hash of a CPF stays personal data, and consent wording and verification standard.
- Not checked: ANPD's children's-data regulation project (listed on the regulatory agenda), CPF-specific ANPD guidance (none found), Civil Code art. 20 image rights, state or municipal rules on children's activities.
