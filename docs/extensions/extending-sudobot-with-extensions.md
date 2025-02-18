# Extending SudoBot with Extensions

SudoBot has support for extensions, and it was introduced in version 6.17. Extensions can extend the bot's feature, by adding commands, event listeners, services and a lot more stuff. You can install/uninstall/disable extensions, or create your own to make the bot behave exactly how you want. Extensions can be written using JavaScript and TypeScript.

In this article, you'll learn how SudoBot's extension system works.

## The `extensions` directory

The `extensions` is a special directory in the project root. Every installed extension stays inside this directory. If you want to install extensions, you have to create a directory named `extensions/` in the project root.

Each installed extension has a directory associated with it inside the `extensions/` directory. Inside of that inner directory, there is a special file `extension.json` which contains meta information about the extension, and how to build it.

The `extension.json` file looks something like this:

```json5
{
    "main": "./build/index.js",        /* The entry point. */
    "commands": "./build/commands",    /* Commands directory. The bot will load commands from this directory. */
    "events": "./build/events",        /* Event handlers directory. The bot will load event handlers from this directory. */
    "language": "typescript",          /* The language being used for this extension. Can be either "javascript" or "typescript". */
    "main_directory": "./build",       /* The main directory where the entry point is located. */
    "build_command": "npm run build"   /* Command to build the extension. In this case `npm run build` invokes `tsc`. */
}
```

## Creating your first SudoBot extension

To get started, first create a directory named `extensions` inside the project root. In that directory, create another directory for your extension. The name of this directory usually should be your extension's name. In this example, we'll name the extension "hello".

Then inside your extension's directory, create the `extension.json` file, and the `src/` directory. Inside `src`, create `events` and `commands` directories. The final directory tree should look something like this:

```
+ sudobot/ [project root]
  + extensions/
    + hello/
      + src/
        + commands/
        + events/
      - extension.json
```

Now add the following to your `extension.json` file:

```json
{
    "main": "./build/index.js",        
    "commands": "./build/commands",    
    "events": "./build/events",        
    "language": "typescript",          
    "main_directory": "./build",       
    "build_command": "npm run build"
}
```

We'll be using TypeScript to write the extension in this example. If you'd like to use JavaScript instead, you can set `language` to `javascript` and you don't need to specify a build command, and your main directory will be the directory where you put your JavaScript files (usually `src/`). You should also adjust the paths to point to that directory (rather than `build/` which is used in this example).

#### Setting up TypeScript and Dependencies

First, run `npm init` to initialize your extension project. This will ask you a few questions and create a `package.json` file. Then run:

<pre class="language-sh"><code class="lang-sh"><strong>npm link --save ../.. # Path to the sudobot project root
</strong></code></pre>

{% hint style="info" %}
Remember **this is a really important step** to make sure your extension can access SudoBot's core utilities to initialize itself. If you don't link SudoBot with your extension, it will fail to import the necessary files.
{% endhint %}

Then we can go ahead and install the dependencies and also set up TypeScript.

```shell
npm install module-alias
npm install -D typescript
npx tsc --init
```

This will add `typescript` as a dev dependency and also create the `tsconfig.json` file which contains the configuration for the TypeScript compiler.

Now open up `tsconfig.json` file, and add the following to the `compilerOptions` object:

```json
"paths": {
    "@sudobot/*": "node_modules/sudobot/build/*"
},
"target": "ES2021",
"experimentalDecorators": true,
"module": "commonjs",
"rootDir": "./src",
"outDir": "./build",
"resolveJsonModule": true,
```

This sets up the `@sudobot` import alias for TypeScript, specifies the source root and build directory, and a few other things that are needed.

{% hint style="info" %}
Remember to build the bot beforehand! As you can see, this alias points to the `build` directory which is created when you build the bot.
{% endhint %}

Then open up `package.json` file and add the following inside the root object:

```json
"_moduleAliases": {
    "@sudobot": "node_modules/sudobot/build"
},
"scripts": {
    "build": "tsc"
}
```

You might be thinking, why do we need to add the module aliases twice? It's because TypeScript doesn't actually deal with these module aliases, it just checks the types and imports. In runtime, we need another way to resolve these imports. We use `module-alias` for that.

#### The entry point

We need to create the entry point now! Make a file `src/index.ts` and put the following code inside of that file:

```typescript
import "module-alias/register";
import { Extension } from "@sudobot/core/Extension";

export default class HelloExtension extends Extension {
    // ...
}
```

That's actually all we need inside this file.

#### Adding commands to the extension

Alright, let's add a command to the extension! Create a file `src/commands/HelloCommand.ts` and inside of that file, put the following code:

```typescript
import BaseCommand, { BasicCommandContext, CommandMessage, CommandReturn } from "@sudobot/core/Command";

export default class HelloCommand extends BaseCommand {
    public readonly name = "hello";
    public readonly description = "A simple hello-world command.";

    async execute(message: CommandMessage, context: BasicCommandContext) {
        await message.reply("Hello world, from the hello extension!");
    }
}
```

This command just responds to the user with "Hello world, from the hello extension!".

#### Adding event listeners to the extension

Now, let's add an event listener to the extension! Create a file `src/events/MessageCreateEvent.ts` and inside of that file, put the following code:

```typescript
import EventListener from "@sudobot/core/EventListener";
import { Message } from "discord.js";

export default class MessageCreateEvent extends EventListener<"messageCreate"> {
    public readonly name = "messageCreate";

    async execute(message: Message) {
        if (message.author.bot) {
            return;
        }
    
        if (message.content === "ping") {
            await message.reply("Pong, from the hello extension!");
        }
    }
}
```

This event listener listens to `messageCreate` event, and whenever someone sends a message with content "ping", it will reply to them.

#### Building the extension

Go to the project root, and run the `extensions.js` script to build all the installed extensions:

```bash
node scripts/extensions.js --build
```

This will take a little bit time. After that, you're ready to go. You can now start the bot (assuming you've build it already):

```bash
npm start
```

And then if everything was configured correctly, the `hello` command will be loaded and can be executed on any server.

Congratulations, you've just built an extension for SudoBot!

### Help and Support

If you need help with anything, feel free to create a discussion topic at the [GitHub repo](https://github.com/onesoft-sudo/sudobot). You can also contact via email at [rakinar2@onesoftnet.eu.org](mailto:rakinar2@onesoftnet.eu.org), or join our [Discord Server](https://discord.gg/892GWhTzgs).
