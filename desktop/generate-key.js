const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');

const {
  issueAdminLicense,
  normalizeLicenseApiUrl,
} = require('./src/main/admin-license-client');

async function main() {
  const rl = readline.createInterface({ input, output });
  const apiUrl = normalizeLicenseApiUrl();

  console.log('--- Backend Issuer ZARU Смета ---');
  console.log(`Используется backend: ${apiUrl}`);

  try {
    const email = (await rl.question('Введите Email клиента: ')).trim();
    const rawPlan = (await rl.question('Введите тариф [standard/double/enterprise] (default: standard): ')).trim();
    const adminSecret = (await rl.question('Введите admin secret (только сам секрет, без команд и кириллицы): ')).trim();

    const result = await issueAdminLicense({
      apiUrl,
      email,
      plan: rawPlan || 'standard',
      adminSecret,
    });

    console.log('\n==================================================');
    console.log('ЛИЦЕНЗИЯ ВЫДАНА');
    console.log(`Ключ: ${result.licenseKey}`);
    console.log(`Тариф: ${result.plan}`);
    console.log(`Слотов ПК: ${result.maxPcs}`);
    console.log(`Действует до: ${result.expiresAt}`);
    console.log('==================================================\n');
    console.log(`Отправьте этот ключ клиенту ${email}`);
  } catch (error) {
    console.error('\nОшибка при выдаче лицензии:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

void main();
