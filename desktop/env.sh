# Source before tauri/cargo when system -dev packages are not installed.
# Provides headers + unversioned .so symlinks from extracted Ubuntu -dev debs.
PREFIX="${HOME}/.local/tauri-sysroot"
SYSROOT_LIB="${PREFIX}/root/usr/lib/x86_64-linux-gnu"
SYSROOT_INC="${PREFIX}/root/usr/include"
SYSROOT_PC="${PREFIX}/root/usr/lib/x86_64-linux-gnu/pkgconfig:${PREFIX}/root/usr/share/pkgconfig"

export PKG_CONFIG_PATH="${SYSROOT_PC}${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export LIBRARY_PATH="${SYSROOT_LIB}:/usr/lib/x86_64-linux-gnu${LIBRARY_PATH:+:$LIBRARY_PATH}"
export LD_LIBRARY_PATH="${SYSROOT_LIB}:/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export C_INCLUDE_PATH="${SYSROOT_INC}:${SYSROOT_LIB}/glib-2.0/include${C_INCLUDE_PATH:+:$C_INCLUDE_PATH}"
export CPLUS_INCLUDE_PATH="${C_INCLUDE_PATH}"
export BINDGEN_EXTRA_CLANG_ARGS="-I${SYSROOT_INC} -I${SYSROOT_LIB}/glib-2.0/include"
# Ensure rustc/lld see unversioned .so symlinks from the local sysroot first
export RUSTFLAGS="-L native=${SYSROOT_LIB} -L native=/usr/lib/x86_64-linux-gnu ${RUSTFLAGS:-}"
export PATH="${HOME}/.cargo/bin:${HOME}/.nvm/versions/node/v20.19.5/bin:${PATH}"
