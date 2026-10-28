// Runs in the supervisor, including with older Portal binaries. Drain both pipes
// concurrently and bound each file even when the engine never restarts.
export const windowsLogCopy = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Threading.Tasks;
public static class PortalLogCopy {
  public static async Task Copy(Stream input, string path, int limit) {
    byte[] buffer = new byte[Math.Min(65536, limit)];
    FileStream output = null;
    try {
      output = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete);
      int count;
      while ((count = await input.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false)) != 0) {
        if (output.Length + count > limit) {
          output.Dispose(); output = null;
          if (File.Exists(path + ".previous")) File.Delete(path + ".previous");
          File.Move(path, path + ".previous");
          output = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete);
        }
        await output.WriteAsync(buffer, 0, count).ConfigureAwait(false);
        await output.FlushAsync().ConfigureAwait(false);
      }
    } finally { if (output != null) output.Dispose(); }
  }
}
'@
`;
