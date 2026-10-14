package br.com.rcconstrutec.centrocustos;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;

import java.io.IOException;

/** Escolha de arquivo das paginas: o botao Camera (capture) abre a camera; os demais, o seletor do Android. */
final class FileChooser {
    private static final int FILE_REQUEST = 42;
    private static final int CAMERA_REQUEST = 43;
    private final Activity activity;
    private ValueCallback<Uri[]> callback;
    private Uri photo;

    FileChooser(Activity activity) { this.activity = activity; }

    /** false se nao houver camera nem seletor de arquivos. */
    boolean open(ValueCallback<Uri[]> next, WebChromeClient.FileChooserParams params) {
        if (callback != null) callback.onReceiveValue(null);
        callback = next;
        if (params.isCaptureEnabled()) {
            try {
                Uri file = CameraFileProvider.newPhotoUri(activity);
                activity.startActivityForResult(CameraFileProvider.captureIntent(file), CAMERA_REQUEST);
                photo = file;
                return true;
            } catch (ActivityNotFoundException | IOException | SecurityException noCamera) { /* cai no seletor */ }
        }
        try { activity.startActivityForResult(params.createIntent(), FILE_REQUEST); return true; }
        catch (ActivityNotFoundException error) { callback = null; return false; }
    }

    /** true se o resultado era deste seletor. */
    boolean result(int requestCode, int resultCode, android.content.Intent data) {
        if (callback == null || (requestCode != FILE_REQUEST && requestCode != CAMERA_REQUEST)) return false;
        Uri[] files = requestCode == CAMERA_REQUEST
                ? (resultCode == Activity.RESULT_OK && photo != null ? new Uri[] {photo} : null)
                : WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        callback.onReceiveValue(files);
        callback = null; photo = null;
        return true;
    }
}
