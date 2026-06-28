# Data processing agreement (template)

Use this template when you deploy AEGIS in front of a third-party LLM and that
provider processes prompts and model output on your behalf. It sketches the
clauses Art. 28(3) of the GDPR requires between a controller and a processor. It
is a starting point, not legal advice. Have your counsel adapt it before signing.

In this arrangement you (the deployer) are the **controller**, and the upstream
LLM provider is the **processor**. If that provider relies on its own
infrastructure suppliers, they are **sub-processors**.

---

## 1. Parties

- **Controller:** the organisation deploying AEGIS. _(name, address, contact)_
- **Processor:** the upstream LLM provider. _(name, address, contact)_

## 2. Subject matter and duration

The processor handles prompts and model output routed through AEGIS so it can
return completions. The agreement runs for as long as that service is provided
and ends when the service ends.

## 3. Nature and purpose

Generating model responses to text that AEGIS forwards after inspection. The
processor must not use the data for any other purpose, and in particular must not
train models on it unless this agreement says so in writing.

## 4. Categories of data and data subjects

- **Data:** the text of prompts and responses, which may contain personal data
  despite the redaction AEGIS applies to its own audit log. Redaction protects
  what AEGIS stores, not what is forwarded to the model to answer the request.
- **Data subjects:** the users of the controller's LLM application.

## 5. Controller instructions

The processor acts only on the controller's documented instructions, including on
transfers, and tells the controller if an instruction appears to breach data
protection law.

## 6. Confidentiality

Anyone the processor authorises to handle the data is bound by an appropriate duty
of confidentiality.

## 7. Security

The processor puts in place the technical and organisational measures required by
Art. 32, appropriate to the risk. List the agreed measures here (encryption in
transit and at rest, access control, logging, and so on).

## 8. Sub-processors

The processor engages a sub-processor only with the controller's prior
authorisation, general or specific, and imposes the same obligations on it by
contract. Keep the current list of sub-processors as an annex.

## 9. International transfers

If the processor or a sub-processor handles the data outside the EEA, a valid
Chapter V transfer mechanism applies, such as standard contractual clauses.
Record the mechanism and the destination countries.

## 10. Assistance to the controller

The processor helps the controller respond to data subject requests and meet its
obligations under Arts. 32 to 36, including breach notification without undue
delay after becoming aware of a personal data breach.

## 11. Deletion or return

On the end of the service the processor deletes or returns the personal data at
the controller's choice, and deletes existing copies unless storage is required
by law.

## 12. Audits

The processor makes available the information needed to show compliance with
Art. 28 and allows for audits, including inspections, by the controller or an
auditor it mandates.

---

_Annexes: (A) list of sub-processors, (B) agreed security measures, (C) approved
transfer mechanisms and regions._
