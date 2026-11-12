const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const java = (name) => read(`android/app/src/main/java/br/com/rcconstrutec/centrocustos/${name}.java`);

test('botao Camera (capture) abre a camera no APK, nao a galeria', () => {
  const main = java('FileChooser');
  assert.match(main, /if \(params\.isCaptureEnabled\(\)\)/);
  const provider = java('CameraFileProvider');
  assert.match(provider, /MediaStore\.ACTION_IMAGE_CAPTURE/);
  assert.match(provider, /MediaStore\.EXTRA_OUTPUT/);
  assert.match(provider, /FLAG_GRANT_WRITE_URI_PERMISSION/);
  assert.match(main, /requestCode == CAMERA_REQUEST/);
  assert.match(java('MainActivity'), /chooser\.open\(callback, params\)/);
  assert.match(java('MainActivity'), /chooser\.result\(requestCode, resultCode, data\)/);
  // sem camera: cai no seletor de arquivos de sempre
  assert.match(main, /params\.createIntent\(\), FILE_REQUEST/);
});

test('foto fica no provider proprio, confinado a cache/camera e sem permissao CAMERA', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /\.CameraFileProvider"\s+android:authorities="\$\{applicationId\}\.camera"\s+android:exported="false"/);
  // declarar CAMERA obrigaria pedir a permissao antes de ACTION_IMAGE_CAPTURE
  assert.doesNotMatch(manifest, /android\.permission\.CAMERA/);
  const provider = java('CameraFileProvider');
  assert.match(provider, /DIR = "camera"/);
  assert.match(provider, /base\.equals\(file\.getParentFile\(\)\)/);
  assert.match(provider, /name\.endsWith\("\.jpg"\)/);
});
