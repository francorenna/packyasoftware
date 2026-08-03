const fs = require('fs');
const pdfParse = require('pdf-parse');

(async () => {
  const data = fs.readFileSync('src/assets/ORDEN PACKYA PROGRAMA.pdf');
  const result = await pdfParse(data);
  console.log('pages', result.numpages);
  console.log(result.text.slice(0, 12000));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
