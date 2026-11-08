import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareRevisionReinterventionEquipment as prepare, validateRevisionReinterventionEquipment as validate, revisionReinterventionEquipment as resolve } from './reintervention-equipment'
const client = { id: 'c', locatii: [{ id: 'l', nume: 'Loc', echipamente: [
  { id: 'e1', nume: 'Poartă', cod: 'P1' }, { id: 'e2', nume: 'Poartă', cod: 'P2' }, { id: 'other', nume: 'Altul', cod: 'X' },
] }] }
const work = { clientId: 'c', locationId: 'l', tipLucrare: 'Revizie', equipmentIds: ['e1'] }
test('one original ID preselects current equipment and writes single equipment fields', () => {
  const result = prepare(client, work)
  assert.equal(result.echipamentId, 'e1'); assert.equal(result.echipament, 'Poartă'); assert.equal(result.echipamentCod, 'P1')
  assert.deepEqual(result.equipmentIds, [])
  assert.equal(validate(client, { ...work, ...result }).echipamentId, 'e1')
})
test('multiple IDs require explicit selection, restricted to original revision', () => {
  const result = prepare(client, { ...work, equipmentIds: ['e1', 'e2'] })
  assert.equal(result.echipamentId, '')
  assert.throws(() => validate(client, { ...work, ...result }), /Selectați echipamentul/)
  assert.equal(validate(client, { ...work, ...result, echipamentId: 'e2' }).echipamentCod, 'P2')
  assert.throws(() => validate(client, { ...work, ...result, echipamentId: 'other' }), /Selectați echipamentul/)
})
test('missing IDs never infer from name or the only equipment', () => {
  const source = { ...work, equipmentIds: [], echipament: 'Poartă' }
  assert.equal(prepare(client, source).echipamentId, '')
  assert.match(resolve(client, source).message, /nu are ID-uri/)
})
test('deleted or moved equipment blocks even if another original equipment remains', () => {
  for (const ids of [['deleted'], ['e1', 'deleted']]) {
    const result = prepare(client, { ...work, equipmentIds: ids })
    assert.equal(result.echipamentId, '')
    assert.throws(() => validate(client, { ...work, ...result, echipamentId: 'e1' }), /nu mai există/)
  }
})
test('save revalidates current location; ID deduplication and no name fallback', () => {
  const result = prepare(client, { ...work, equipmentIds: ['e1', 'e1'] })
  assert.equal(result.echipamentId, 'e1')
  const changed = { ...client, locatii: [{ ...client.locatii[0], echipamente: [] }] }
  assert.throws(() => validate(changed, { ...work, ...result }), /nu mai există/)
  assert.throws(() => validate(client, { ...work, ...result, locationId: 'missing' }), /Locația/)
})

test('duplicate location IDs cannot hide a missing original equipment', () => {
  const duplicate = { ...client, locatii: [{ ...client.locatii[0], echipamente: [client.locatii[0].echipamente[0], client.locatii[0].echipamente[0]] }] }
  assert.match(resolve(duplicate, { ...work, equipmentIds: ['e1', 'deleted'] }).message, /nu mai există/)
  assert.match(resolve(client, { ...work, equipmentIds: 'e1' }).message, /nu are ID-uri/)
})
