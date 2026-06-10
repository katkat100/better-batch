package io.github.katkat100.betterbatch;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Embrace edge-to-edge: WebView draws under the system status
        // bar and gesture nav bar. Android 15+ enforces this for apps
        // targeting API 35+; we set it explicitly so older versions
        // also get the modern layout.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // When the status bar is hidden (StatusBar.hide() from JS), a
        // swipe from the top edge should reveal it only *transiently* —
        // it auto-hides again after a moment or when the user interacts
        // with the content. BEHAVIOR_DEFAULT would make a swiped-in bar
        // stick around, which is what we're avoiding here.
        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );

        final WebView webView = getBridge().getWebView();
        // Tell the WebView (and the layout chain above it) not to
        // auto-consume insets as padding — we want to handle them
        // ourselves via the JS bridge below.
        webView.setFitsSystemWindows(false);
        View parent = (View) webView.getParent();
        while (parent != null) {
            parent.setFitsSystemWindows(false);
            View next = parent.getParent() instanceof View
                ? (View) parent.getParent() : null;
            if (next == parent) break;
            parent = next;
        }

        // Listen for WindowInsets at the decor view (the topmost
        // ancestor) so we always receive the system bar dimensions
        // regardless of what Capacitor's layout chain does.
        // Forward them as --bb-safe-top / --bb-safe-bottom CSS
        // custom properties on <html>.
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, windowInsets) -> {
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
            webView.post(() -> webView.evaluateJavascript(script, null));
            return windowInsets;
        });
    }
}
