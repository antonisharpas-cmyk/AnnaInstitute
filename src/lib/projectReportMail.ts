/**
 * The words of the shareholders' email, and how they are filled.
 *
 * {name} is each shareholder's own name, so one text written once reaches
 * several people each by name; {project} is the development and {date} today.
 * {{name}} works as well, the way the campaigns write it.
 */
export function fillReportText(text: string, values: { name: string; project: string; date: string }): string {
  return text
    .replace(/\{\{?\s*name\s*\}?\}/gi, values.name)
    .replace(/\{\{?\s*project\s*\}?\}/gi, values.project)
    .replace(/\{\{?\s*date\s*\}?\}/gi, values.date);
}

export const REPORT_SUBJECT = "Project status: {project}, {date}";

export const REPORT_BODY = `Dear {name},

Please find attached the latest status report for {project}, as of {date}.

It shows the apartments and their buyers, where each buyer's payments stand, and the constructor's contract with the payments made on it.

If you have any questions, we are happy to go through it with you.

Kind regards,
One Eleven`;

export const REPORT_SUBJECT_EL = "Κατάσταση έργου: {project}, {date}";

export const REPORT_BODY_EL = `Αγαπητέ/ή {name},

Σας επισυνάπτουμε την τελευταία αναφορά κατάστασης για το {project}, με ημερομηνία {date}.

Δείχνει τα διαμερίσματα και τους αγοραστές τους, πού βρίσκονται οι πληρωμές κάθε αγοραστή, και τη σύμβαση του κατασκευαστή με τις πληρωμές που έχουν γίνει.

Για οποιαδήποτε απορία, είμαστε στη διάθεσή σας.

Με εκτίμηση,
One Eleven`;
