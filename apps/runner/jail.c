/*
 * jail — runs one untrusted program with hard limits.
 *
 *   jail <mode> <cpu_seconds> <memory_mb> <file_kb> -- <program> [args...]
 *
 * mode "run":     no network, no new processes, no signalling other processes
 * mode "compile": same, but may start child processes (gcc runs cc1/as/ld)
 *
 * Files: with Landlock (Linux 5.13+) the program can only read system directories
 * (/usr, /lib, /bin, /etc) and read/write its own working directory — never other students'
 * code, the runner itself, or /proc of other processes.
 *
 * Limits: CPU time, address space, output file size, open files. The environment is replaced
 * with a minimal one, and the program gets its own session so the caller can kill the whole group.
 * Exit 125 means the jail itself failed (only when JAIL_STRICT=1 and seccomp can't be loaded).
 */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <seccomp.h>
#include <sys/syscall.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <unistd.h>

static void lim(int what, rlim_t soft, rlim_t hard) {
  struct rlimit r = {soft, hard};
  setrlimit(what, &r);
}

static const char *DENY_ALWAYS[] = {
    "socket", "socketpair", "connect", "bind", "listen", "accept", "accept4",
    "kill", "tkill", "tgkill", "rt_sigqueueinfo", "rt_tgsigqueueinfo",
    "pidfd_open", "pidfd_send_signal", "pidfd_getfd", "ptrace",
    "process_vm_readv", "process_vm_writev", "mount", "umount2", "unshare",
    "setns", "chroot", "pivot_root", "keyctl", "add_key", "request_key", "bpf",
    "perf_event_open", "userfaultfd", "io_uring_setup", "personality",
    "kexec_load", "init_module", "finit_module", "reboot", "swapon", "swapoff",
    NULL};
static const char *DENY_RUN[] = {"fork", "vfork", "clone", "clone3", "execveat", NULL};

static int load_filter(int run_mode) {
  scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_ALLOW);
  if (!ctx) return -1;
  for (int i = 0; DENY_ALWAYS[i]; i++) {
    int nr = seccomp_syscall_resolve_name(DENY_ALWAYS[i]);
    if (nr != __NR_SCMP_ERROR) seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), nr, 0);
  }
  if (run_mode)
    for (int i = 0; DENY_RUN[i]; i++) {
      int nr = seccomp_syscall_resolve_name(DENY_RUN[i]);
      if (nr != __NR_SCMP_ERROR) seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), nr, 0);
    }
  int rc = seccomp_load(ctx);
  seccomp_release(ctx);
  return rc;
}

#define ACCESS_ALL                                                                   \
  (LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_WRITE_FILE |                       \
   LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR |                       \
   LANDLOCK_ACCESS_FS_REMOVE_DIR | LANDLOCK_ACCESS_FS_REMOVE_FILE |                   \
   LANDLOCK_ACCESS_FS_MAKE_CHAR | LANDLOCK_ACCESS_FS_MAKE_DIR |                       \
   LANDLOCK_ACCESS_FS_MAKE_REG | LANDLOCK_ACCESS_FS_MAKE_SOCK |                       \
   LANDLOCK_ACCESS_FS_MAKE_FIFO | LANDLOCK_ACCESS_FS_MAKE_BLOCK |                     \
   LANDLOCK_ACCESS_FS_MAKE_SYM)
#define ACCESS_READ                                                                  \
  (LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR)

static void allow(int ruleset, const char *path, __u64 access) {
  int fd = open(path, O_PATH | O_CLOEXEC);
  if (fd < 0) return;
  struct landlock_path_beneath_attr pb = {.allowed_access = access, .parent_fd = fd};
  syscall(SYS_landlock_add_rule, ruleset, LANDLOCK_RULE_PATH_BENEATH, &pb, 0);
  close(fd);
}

/* Returns 0 when the filesystem is restricted, -1 when Landlock isn't available. */
static int restrict_files(void) {
  struct landlock_ruleset_attr attr = {.handled_access_fs = ACCESS_ALL};
  int rs = syscall(SYS_landlock_create_ruleset, &attr, sizeof(attr), 0);
  if (rs < 0) return -1;
  const char *ro[] = {"/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc", NULL};
  for (int i = 0; ro[i]; i++) allow(rs, ro[i], ACCESS_READ);
  allow(rs, "/dev/null", LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE);
  allow(rs, "/dev/urandom", LANDLOCK_ACCESS_FS_READ_FILE);
  allow(rs, ".", ACCESS_ALL);
  int rc = syscall(SYS_landlock_restrict_self, rs, 0);
  close(rs);
  return rc;
}

int main(int argc, char **argv) {
  if (argc < 7 || strcmp(argv[5], "--") != 0) {
    fprintf(stderr, "usage: jail <run|compile> <cpu_s> <mem_mb> <file_kb> -- prog [args]\n");
    return 125;
  }
  int run_mode = strcmp(argv[1], "run") == 0;
  rlim_t cpu = strtoul(argv[2], NULL, 10);
  rlim_t mem = strtoul(argv[3], NULL, 10) * 1024 * 1024;
  rlim_t fsz = strtoul(argv[4], NULL, 10) * 1024;

  setsid();
  lim(RLIMIT_CPU, cpu, cpu + 1);
  lim(RLIMIT_AS, mem, mem);
  lim(RLIMIT_FSIZE, fsz, fsz);
  lim(RLIMIT_NOFILE, 64, 64);
  lim(RLIMIT_CORE, 0, 0);
  lim(RLIMIT_STACK, 64 * 1024 * 1024, 64 * 1024 * 1024);
  prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0);
  prctl(PR_SET_DUMPABLE, 0, 0, 0, 0);

  const char *strict = getenv("JAIL_STRICT");
  int must = strict && strcmp(strict, "1") == 0;
  if (restrict_files() != 0 && must) return 125;
  if (load_filter(run_mode) != 0 && must) return 125;

  char *envp[] = {"PATH=/usr/local/bin:/usr/bin:/bin", "HOME=.", "TMPDIR=.", "LANG=C.UTF-8",
                  "PYTHONIOENCODING=utf-8", "PYTHONDONTWRITEBYTECODE=1", NULL};
  execvpe(argv[6], &argv[6], envp);
  perror("exec");
  return 125;
}
