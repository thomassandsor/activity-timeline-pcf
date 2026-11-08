// Shared by every component's scripts/strings.mjs: writes one resx file per language from a string table.
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

/** The languages every component ships. Each table entry is [English, Norwegian Bokmål, Swedish, Danish]. */
export const LANGUAGES = [
    { lcid: "1033", name: "English" },
    { lcid: "1044", name: "Norwegian" },
    { lcid: "1053", name: "Swedish" },
    { lcid: "1030", name: "Danish" },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const header = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <xsd:schema id="root" xmlns="" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:msdata="urn:schemas-microsoft-com:xml-msdata">
    <xsd:import namespace="http://www.w3.org/XML/1998/namespace" />
    <xsd:element name="root" msdata:IsDataSet="true">
      <xsd:complexType>
        <xsd:choice maxOccurs="unbounded">
          <xsd:element name="data">
            <xsd:complexType>
              <xsd:sequence>
                <xsd:element name="value" type="xsd:string" minOccurs="0" msdata:Ordinal="1" />
              </xsd:sequence>
              <xsd:attribute name="name" use="required" type="xsd:string" msdata:Ordinal="1" />
              <xsd:attribute ref="xml:space" />
            </xsd:complexType>
          </xsd:element>
        </xsd:choice>
      </xsd:complexType>
    </xsd:element>
  </xsd:schema>
  <resheader name="resmimetype">
    <value>text/microsoft-resx</value>
  </resheader>
  <resheader name="version">
    <value>2.0</value>
  </resheader>
  <resheader name="reader">
    <value>System.Resources.ResXResourceReader, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089</value>
  </resheader>
  <resheader name="writer">
    <value>System.Resources.ResXResourceWriter, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089</value>
  </resheader>
`;

/** Placeholders like {0} must be the same in every language, or a translation silently drops a value. */
function placeholders(text) {
    return (text.match(/\{\d+\}/g) ?? []).sort().join(",");
}

/** Writes strings/<control>.<lcid>.resx for every language. Fails on a missing translation or mismatched placeholders. */
export function writeResx(dir, control, table) {
    const problems = [];
    for (const [key, values] of Object.entries(table)) {
        LANGUAGES.forEach((lang, i) => {
            if (typeof values[i] !== "string" || values[i].trim() === "") problems.push(`${key}: no ${lang.name} text`);
            else if (placeholders(values[i]) !== placeholders(values[0])) problems.push(`${key}: ${lang.name} placeholders differ from English`);
        });
    }
    if (problems.length > 0) {
        console.error(problems.join("\n"));
        process.exit(1);
    }
    mkdirSync(join(dir, "strings"), { recursive: true });
    LANGUAGES.forEach((lang, i) => {
        const body = Object.entries(table)
            .map(([key, values]) => `  <data name="${key}" xml:space="preserve">\n    <value>${esc(values[i])}</value>\n  </data>\n`)
            .join("");
        writeFileSync(join(dir, "strings", `${control}.${lang.lcid}.resx`), header + body + "</root>\n", "utf8");
    });
}
