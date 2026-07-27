const { spawn } = require('child_process');

class DockerRunner {
  run(command, args, emit, cwd = undefined) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, shell: false, env: { ...process.env, DOCKER_BUILDKIT: '1' } });
      let output = '';

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        output += text;
        emit(text, { stage: 'stream' });
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        output += text;
        emit(text, { stage: 'stream' });
      });

      child.on('error', (error) => {
        reject(new Error(`Unable to run ${command}: ${error.message}`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}`));
        }
      });
    });
  }

  announce(emit, command, args = []) {
    const rendered = [command, ...args]
      .map((arg) => {
        if (/\s|"/.test(arg)) {
          return `"${String(arg).replace(/"/g, '\\"')}"`;
        }
        return String(arg);
      })
      .join(' ');

    emit(`Docker command: ${rendered}`, { stage: 'docker-command', command: rendered });
  }
}

module.exports = DockerRunner;
