package br.com.rcconstrutec.centrocustos;

import android.content.ClipData;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/**
 * Foto tirada pelo botao Camera das paginas: o app de camera grava em cache/camera (permissao de escrita
 * concedida so a ele pelo Uri) e a WebView le o mesmo arquivo para anexar ao lancamento.
 */
public final class CameraFileProvider extends ContentProvider {
    static final String DIR = "camera";
    static final String MIME = "image/jpeg";

    /** Cria um arquivo novo para a foto; apaga as fotos antigas (a pagina ja as leu). */
    static File newPhoto(Context context) throws IOException {
        File dir = new File(context.getCacheDir(), DIR);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("sem pasta");
        File[] old = dir.listFiles();
        if (old != null) for (File file : old) if (System.currentTimeMillis() - file.lastModified() > 3_600_000L) file.delete();
        return new File(dir, "foto-" + System.currentTimeMillis() + ".jpg");
    }

    static Uri newPhotoUri(Context context) throws IOException {
        return uriFor(context, newPhoto(context));
    }

    /** Pedido ao app de camera: grava a foto no Uri, com permissao de escrita so para ele. */
    static Intent captureIntent(Uri photo) {
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, photo)
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.setClipData(ClipData.newRawUri("foto", photo)); // concede o Uri ao app de camera
        return intent;
    }

    static Uri uriFor(Context context, File file) {
        return new Uri.Builder().scheme("content").authority(context.getPackageName() + ".camera")
                .appendPath(DIR).appendPath(file.getName()).build();
    }

    /** Resolve o Uri para um arquivo dentro de cache/camera; qualquer coisa fora dela e recusada. */
    private File resolve(Uri uri) throws FileNotFoundException {
        Context context = getContext();
        String name = uri.getLastPathSegment();
        if (context == null || name == null || name.contains("/") || name.contains("\\") || !name.endsWith(".jpg")) throw new FileNotFoundException();
        try {
            File base = new File(context.getCacheDir(), DIR).getCanonicalFile();
            File file = new File(base, name).getCanonicalFile();
            if (!base.equals(file.getParentFile())) throw new FileNotFoundException();
            return file;
        } catch (IOException error) {
            throw new FileNotFoundException();
        }
    }

    @Override public boolean onCreate() { return true; }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(resolve(uri), ParcelFileDescriptor.parseMode(mode));
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File file;
        try { file = resolve(uri); } catch (FileNotFoundException missing) { return null; }
        MatrixCursor cursor = new MatrixCursor(new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        cursor.addRow(new Object[] {file.getName(), file.length()});
        return cursor;
    }

    @Override public String getType(Uri uri) { return MIME; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
}
