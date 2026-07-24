## Statement of Account Template Analysis

This document outlines the structure and key data points extracted from the provided `seaworldstatement.pdf` to inform the creation of a dynamic statement of account template within the AR Pro application.

### General Structure
The statement is divided into several main sections:
1.  **Header:** Contains company information, date, and payment terms.
2.  **Total Amounts Summary:** A table summarizing financial figures by company and currency.
3.  **Analysis Section:** A detailed breakdown of documents (invoices, receipts) with their respective amounts, overdue status, and other relevant information.
4.  **Bank Details:** Information for payment.

### Key Data Points and Fields

#### 1. Header Information
-   **COMPANY:** Name of the client company.
-   **DATE:** Date of the statement (e.g., 17/7/2026).
-   **PAYMENT TERMS:** Payment terms (e.g., "60 days Credit / Πίστωση 60 ημερών").

#### 2. Total Amounts Summary Table
This section presents a summary of financial data, grouped by `Company` and `Currency`.

| Column Name           | Description                                       | Example Data | Data Type |
| :-------------------- | :------------------------------------------------ | :----------- | :-------- |
| **Company**           | Name of the company within the group              | PRIME PRODUCTS LTD | String    |
| **Currency**          | Currency of the amounts                           | EUR          | String    |
| **Balance**           | Total outstanding balance for the company/currency | 964,31       | Number    |
| **Unpaid Documents**  | Sum of unpaid documents                           | 0,00         | Number    |
| **Overdue Documents** | Sum of overdue documents                          | 0,00         | Number    |
| **Upcoming Within Month** | Amounts due within the current month            | 0,00         | Number    |
| **Upcoming Next Month** | Amounts due in the next month                     | 0,00         | Number    |

#### 3. Analysis Section
This section provides a detailed list of individual financial documents, typically grouped by a main company or entity (e.g., "PIRAEUS", "HOUSTON").

| Column Name       | Description                                       | Example Data | Data Type |
| :---------------- | :------------------------------------------------ | :----------- | :-------- |
| **Doc. Date**     | Date of the document                              | 22/10/2025   | Date      |
| **Documents**     | Document number or reference                      | TATX-113252  | String    |
| **Doc. Amount**   | Original amount of the document                   | 635,93       | Number    |
| **Open Doc. Amount** | Remaining open amount of the document             | 635,93       | Number    |
| **Overdue**       | Number of days overdue                            | 208          | Number    |
| **Vessel**        | Vessel name (specific to shipping industry)       | SEA GALAXY   | String    |
| **Comments**      | Additional comments or references                 | SGAL-C37-251371 | String    |

#### 4. Bank Details
-   **BANK DETAILS BENEFICIARY NAME:** Name of the beneficiary.
-   **IBAN:** International Bank Account Number.
-   **SWIFT Code:** SWIFT/BIC code.

### Template Requirements
Based on this analysis, the template should be dynamic and capable of:
-   Populating company-specific data (name, date, payment terms).
-   Generating the "Total Amounts Summary" table based on the customer's group structure and associated companies/currencies.
-   Generating the "Analysis" section with detailed document information, potentially filtering by customer or group.
-   Including static bank details or dynamically fetching them if they vary per customer.
-   Handling multiple currencies and formatting amounts appropriately.

This template will likely require a server-side rendering approach (e.g., using a templating engine like Handlebars or EJS, or generating PDF directly from HTML/CSS) to accurately replicate the layout and data presentation. The data for these sections will need to be fetched from the AR Pro database. This will be a complex task, likely requiring a dedicated backend service to generate the PDF or HTML output.
