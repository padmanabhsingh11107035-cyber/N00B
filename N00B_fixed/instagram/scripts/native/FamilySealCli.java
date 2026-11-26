package com.noob.social;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test tool only (never shipped): locks a place with FamilySenderCore so scripts/supabase/test-family-phone.mjs can open it with the app's own code.
 *  stdin: room id / place JSON / "kid x y d" of the sender / one "kid x y" per recipient.   Or: "SEND hasPrev prevLat prevLng prevAt lat lng now" prints true / false. */
public class FamilySealCli {
  public static void main(String[] a) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
    String first = in.readLine();
    if (first != null && first.startsWith("SEND ")) {
      String[] p = first.split(" ");
      System.out.println(FamilySenderCore.shouldSend(p[1].equals("1"), Double.parseDouble(p[2]), Double.parseDouble(p[3]), Long.parseLong(p[4]), Double.parseDouble(p[5]), Double.parseDouble(p[6]), Long.parseLong(p[7])));
      return;
    }
    String room = first, place = in.readLine();
    String[] s = in.readLine().split(" ");
    FamilySenderCore.DeviceKey sender = new FamilySenderCore.DeviceKey(s[0], s[1], s[2], s[3]);
    List<FamilySenderCore.Recipient> rs = new ArrayList<>();
    String line;
    while ((line = in.readLine()) != null && !line.isEmpty()) { String[] r = line.split(" "); rs.add(new FamilySenderCore.Recipient(r[0], new FamilySenderCore.PublicKeyJwk(r[1], r[2]))); }
    System.out.println(FamilySenderCore.sealPlace(room, place, sender, rs));
  }
}
