"""Turns the app's one launcher entry into two (normal icon / NOOB Pro icon) in the generated AndroidManifest.xml. Exactly one of them is enabled; AppIconPlugin.java switches them.
usage: python3 add-icon-aliases.py <AndroidManifest.xml>   (stops with an error if the manifest does not look as expected, so a build can never ship without the launcher)"""
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
launcher = re.compile(r'<intent-filter>\s*<action android:name="android.intent.action.MAIN"\s*/>\s*<category android:name="android.intent.category.LAUNCHER"\s*/>\s*</intent-filter>')
if len(launcher.findall(s)) != 1 or '</application>' not in s:
    sys.exit('the manifest has no single launcher entry to turn into two')
s = launcher.sub('', s, count=1)
entry = """
        <activity-alias android:name=".%(n)s" android:targetActivity=".MainActivity" android:enabled="%(on)s" android:exported="true"
            android:icon="@mipmap/%(i)s" android:roundIcon="@mipmap/%(i)s_round" android:label="@string/app_name">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity-alias>"""
aliases = entry % dict(n='IconDefault', on='true', i='ic_launcher') + entry % dict(n='IconPro', on='false', i='ic_launcher_pro') + '\n'
s = s.replace('</application>', aliases + '    </application>', 1)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('two launcher entries written')
