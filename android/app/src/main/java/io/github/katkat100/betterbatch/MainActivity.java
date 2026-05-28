package io.github.katkat100.betterbatch;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Embrace edge-to-edge so the WebView draws under the system
        // status bar (and gesture nav bar at the bottom). Android 15+
        // does this by default but we set it explicitly so older
        // versions also get the modern layout.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Chromium WebView on Android does not always populate the
        // env(safe-area-inset-*) CSS environment vars from the host
        // Activity's WindowInsets. Forward them ourselves as
        // --bb-safe-top / --bb-safe-bottom custom properties on
        // <html> so the web layer can pad content with
        // var(--bb-safe-top, env(safe-area-inset-top)).
        WebView webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
            Insets systemBars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars()
            );
            float density = v.getResources().getDisplayMetrics().density;
            int topDp = Math.round(systemBars.top / density);
            int bottomDp = Math.round(systemBars.bottom / density);

            String script = String.format(
                "document.documentElement.style.setProperty('--bb-safe-top','%dpx');"
                    + "document.documentElement.style.setProperty('--bb-safe-bottom','%dpx');",
                topDp, bottomDp
            );
            webView.evaluateJavascript(script, null);
            return windowInsets;
        });
    }
}
