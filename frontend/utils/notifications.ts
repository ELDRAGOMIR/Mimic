import { withComputerConfig } from "./persistence";
import { Notifications } from "expo";
import * as Permissions from "expo-permissions";
import socket from "./socket";
import { Notification } from "expo/build/Notifications/Notifications.types";

/**
 * Represents a type of push notification that can be sent by Rift.
 */
export enum NotificationType {
    // Every client subscribes to this. Clears all received notifications.
    CLEAR = "CLEAR",

    // Sent when ready check triggers.
    READY_CHECK = "READY_CHECK",

    // Sent when the game has (almost) started.
    GAME_STARTED = "GAME_STARTED"
}

/**
 * Represents a platform that can receive push notifications.
 */
export enum NotificationPlatform {
    IOS = "ios",
    ANDROID = "android",
    WEB = "web"
}

/**
 * Sends the updated push notification tokens to the server so that this
 * device is reachable. Should be called after notification settings are updated.
 */
export async function updateNotificationTokens() {
    const settings = await withComputerConfig();
    const response = await Permissions.getAsync(Permissions.NOTIFICATIONS);

    if (!response.granted) {
        await socket.registerPushNotificationToken(NotificationType.CLEAR, null);
        await socket.registerPushNotificationToken(NotificationType.GAME_STARTED, null);
        await socket.registerPushNotificationToken(NotificationType.READY_CHECK, null);

        return;
    }

    const token = await Notifications.getExpoPushTokenAsync();

    await socket.registerPushNotificationToken(NotificationType.CLEAR, token);
    await socket.registerPushNotificationToken(
        NotificationType.GAME_STARTED,
        settings.gameStartNotificationsEnabled ? token : null
    );
    await socket.registerPushNotificationToken(
        NotificationType.READY_CHECK,
        settings.readyCheckNotificationsEnabled ? token : null
    );
}

async function handleNotification(notification: Notification) {
    // Clear notifications if needed.
    if (notification.data.type === NotificationType.CLEAR) {
        await Notifications.dismissAllNotificationsAsync();
        return;
    }

    if (notification.origin === "received") {
        // The notification happened while we were focused.
        // Ignore it since we aren't interested.
        // TODO (molenzwiebel): Maybe show a local copy of the notification if != READY_CHECK?
        return;
    }

    // TODO: Figure out how to find selected result.
    // For now, just connect.
    if (!socket.connected || socket.code !== notification.data.code) {
        socket.connect(notification.data.code);
    }
}

/**
 * Registers the notification categories used in iOS/Android.
 */
export async function registerForNotifications() {
    await Notifications.createCategoryAsync(NotificationType.READY_CHECK, [
        {
            actionId: "accept",
            buttonTitle: "Accept"
        },
        {
            actionId: "decline",
            buttonTitle: "Decline",
            doNotOpenInForeground: true // handle in the background
        }
    ]);

    await Notifications.createChannelAndroidAsync(NotificationType.READY_CHECK, {
        name: "Ready Check Notifications",
        description:
            "Notifications sent when your queue pops! These are a pretty high priority, to ensure that they get to you as fast as possible.",
        vibrate: true,
        priority: "max"
    });

    await Notifications.createChannelAndroidAsync(NotificationType.GAME_STARTED, {
        name: "Game Start Notifications",
        description:
            "Notifications sent when minions are about to spawn and you're still away from your computer. High priority, to ensure that you get back before the first wave spawns.",
        vibrate: true,
        priority: "max"
    });

    await Notifications.addListener(handleNotification);
}