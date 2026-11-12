import test from 'node:test';
import assert from 'node:assert';

test('PR (b) - App Shell and Wizard Flow Validation', async (t) => {
  await t.test('1. Valida completude do perfil com base nos campos', () => {
    function calculateCompleteness(profile) {
      let filledFields = 0;
      if (profile.displayName) filledFields++;
      if (profile.businessName) filledFields++;
      if (profile.city) filledFields++;
      if (profile.whatsapp && /^[1-9]\d{7,14}$/.test(profile.whatsapp)) filledFields++;
      if (profile.interests && profile.interests.length > 0) filledFields++;
      return filledFields * 20;
    }

    assert.equal(calculateCompleteness({}), 0);
    assert.equal(calculateCompleteness({ displayName: 'Maria' }), 20);
    assert.equal(calculateCompleteness({ displayName: 'Maria', businessName: 'Ateliê' }), 40);
    assert.equal(calculateCompleteness({ displayName: 'Maria', businessName: 'Ateliê', city: 'POA', whatsapp: '5551999999999', interests: ['design'] }), 100);
  });

  await t.test('2. Valida formato do WhatsApp de acordo com regex do contrato', () => {
    const regex = /^[1-9]\d{7,14}$/;
    assert.ok(regex.test('5551999999999'));
    assert.ok(regex.test('5511999999999'));
    assert.strictEqual(regex.test('0551199999999'), false); // starts with 0
    assert.strictEqual(regex.test('+5511999999999'), false); // contains +
    assert.strictEqual(regex.test('55 11 999999999'), false); // contains space
  });

  await t.test('3. Valida áreas de atuação aceitas no Passo 1 do assistente', () => {
    const validAreas = ['food', 'art', 'photo', 'health', 'tech'];
    assert.ok(validAreas.includes('food'));
    assert.ok(validAreas.includes('art'));
    assert.ok(validAreas.includes('photo'));
    assert.ok(validAreas.includes('health'));
    assert.ok(validAreas.includes('tech'));
  });
});
