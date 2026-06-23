// 非対話: 資産ID→名前テーブルをJSONで /tmp/ut_assets/ に書き出す
using System.Text;
using System.IO;

EnsureDataLoaded();

string outDir = "/tmp/ut_assets";
Directory.CreateDirectory(outDir);

void DumpNames<T>(string name, IList<T> assets) where T : UndertaleNamedResource
{
    var sb = new StringBuilder();
    sb.Append("[");
    for (int i = 0; i < assets.Count; i++)
    {
        if (i > 0) sb.Append(",");
        var a = assets[i];
        string nm = (a != null && a.Name != null) ? a.Name.Content : "";
        // JSON文字列エスケープ(簡易: 名前は識別子なので " \ のみ考慮)
        nm = nm.Replace("\\", "\\\\").Replace("\"", "\\\"");
        sb.Append("\"").Append(nm).Append("\"");
    }
    sb.Append("]");
    File.WriteAllText(Path.Combine(outDir, name + ".json"), sb.ToString());
}

DumpNames("sounds", Data.Sounds);
DumpNames("sprites", Data.Sprites);
DumpNames("objects", Data.GameObjects);

// object名 -> {sprite名, parent名} の対応（バトル吹き出し/顔解決用）
{
    var sb = new StringBuilder();
    sb.Append("{");
    bool first = true;
    foreach (var o in Data.GameObjects)
    {
        if (o == null || o.Name == null) continue;
        if (!first) sb.Append(",");
        first = false;
        string nm = o.Name.Content.Replace("\\", "\\\\").Replace("\"", "\\\"");
        string spr = (o.Sprite != null && o.Sprite.Name != null) ? o.Sprite.Name.Content : "";
        string par = (o.ParentId != null && o.ParentId.Name != null) ? o.ParentId.Name.Content : "";
        spr = spr.Replace("\\", "\\\\").Replace("\"", "\\\"");
        par = par.Replace("\\", "\\\\").Replace("\"", "\\\"");
        sb.Append("\"").Append(nm).Append("\":{\"sprite\":\"").Append(spr).Append("\",\"parent\":\"").Append(par).Append("\"}");
    }
    sb.Append("}");
    File.WriteAllText(Path.Combine(outDir, "object_info.json"), sb.ToString());
}

Console.WriteLine("Sounds=" + Data.Sounds.Count + " Sprites=" + Data.Sprites.Count + " Objects=" + Data.GameObjects.Count);
Console.WriteLine("Wrote tables to " + outDir);
