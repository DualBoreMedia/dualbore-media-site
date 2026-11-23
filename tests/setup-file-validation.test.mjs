import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSetupFileChoice,SETUP_FILE_MAX_BYTES,SETUP_FILE_MIN_BYTES,SETUP_FILE_MESSAGE} from '../src/operations/setup-file-validation.js';
const input=(size,name='owner-track.stp')=>({size,name});

test('private STP preflight uses server-matching size boundaries and a safe filename',()=>{
 assert.equal(SETUP_FILE_MIN_BYTES,48);
 assert.equal(SETUP_FILE_MAX_BYTES,2*1024*1024);
 assert.equal(validateSetupFileChoice(input(48)),null);
 assert.equal(validateSetupFileChoice(input(SETUP_FILE_MAX_BYTES,'2023_TC125 (Assen).STP')),null);
 assert.equal(validateSetupFileChoice(input(47)),SETUP_FILE_MESSAGE);
 assert.equal(validateSetupFileChoice(input(SETUP_FILE_MAX_BYTES+1)),SETUP_FILE_MESSAGE);
});
test('invalid filenames and malformed objects are rejected before a private upload',()=>{
 for(const file of [
  null,undefined,{},input(NaN),input(-1),input(48,'../secret.stp'),
  input(48,'a\\b.stp'),input(48,'bad.txt'),input(48,'.stp'),
  input(48,'owner\n.stp'),input(48,'owner@example.stp'),
  input(48,'bad_filename.stp?'),input(48,'very-long-'+('x'.repeat(121))+'.stp')
 ])assert.equal(validateSetupFileChoice(file),SETUP_FILE_MESSAGE);
});
