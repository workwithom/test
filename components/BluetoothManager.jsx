'use client'

import { useState, useEffect } from 'react'
import {
  bluetoothManager,
  syncDataToESP32,
  getESP32StorageInfo,
  getESP32AttendanceData,
  clearESP32Attendance,
} from '@/lib/bluetooth'

export default function BluetoothManager({ classes, onClassesUpdate }) {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [deviceInfo, setDeviceInfo] = useState(null)
  const [storageInfo, setStorageInfo] = useState(null)
  const [attendanceData, setAttendanceData] = useState(null)
  const [syncedData, setSyncedData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Set up connection change listener
    bluetoothManager.onConnectionChange = (connected) => {
      setIsConnected(connected)
      if (!connected) {
        setDeviceInfo(null)
        setStorageInfo(null)
        setAttendanceData(null)
        setSyncedData(null)
      }
    }

    // Set up data received listener
    bluetoothManager.onDataReceived = (characteristic, data) => {
      console.log('Data received from ESP32:', characteristic, data)
      try {
        const parsedData = JSON.parse(data)
        if (characteristic === 'CLASS_DATA') {
          setSyncedData(parsedData)
        }
      } catch (error) {
        console.error('Error parsing received data:', error)
      }
    }

    return () => {
      bluetoothManager.onConnectionChange = null
      bluetoothManager.onDataReceived = null
    }
  }, [])

  const handleConnect = async () => {
    setIsConnecting(true)
    setError(null)

    try {
      await bluetoothManager.connect()

      // Get device info after connection
      const status = await bluetoothManager.getDeviceStatus()
      setDeviceInfo(status)

      // Get storage info
      await refreshStorageInfo()
    } catch (error) {
      console.error('Connection failed:', error)
      setError(error.message)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await bluetoothManager.disconnect()
    } catch (error) {
      console.error('Disconnect failed:', error)
    }
  }

  const refreshStorageInfo = async () => {
    if (!isConnected) return

    try {
      const storage = await getESP32StorageInfo()
      setStorageInfo(storage)
    } catch (error) {
      console.error('Failed to get storage info:', error)
    }
  }

  const handleSyncData = async () => {
    if (!isConnected || classes.length === 0) return

    setLoading(true)
    setError(null)

    try {
      // Prepare data for ESP32
      const esp32Data = classes.map((classItem) => ({
        id: classItem.id,
        name: classItem.name,
        students: classItem.students.map((student) => ({
          roll: student.roll,
          name: student.name,
        })),
      }))

      await syncDataToESP32(esp32Data)
      setSyncedData(esp32Data)

      // Refresh device info and storage info after sync
      const status = await bluetoothManager.getDeviceStatus()
      setDeviceInfo(status)
      await refreshStorageInfo()

      alert('Data synced successfully to ESP32!')
    } catch (error) {
      console.error('Sync failed:', error)
      setError(error.message)
      alert('Failed to sync data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadAttendance = async () => {
    if (!isConnected) return

    setLoading(true)
    setError(null)

    try {
      const attendance = await getESP32AttendanceData()
      setAttendanceData(attendance)
    } catch (error) {
      console.error('Failed to download attendance:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAttendance = async (classId, records) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId,
          records,
        }),
      })

      if (response.ok) {
        // Clear attendance on ESP32 after successful save
        await clearESP32Attendance(classId)

        // Refresh attendance data
        await handleDownloadAttendance()

        // Update classes to reflect attendance taken
        onClassesUpdate()

        alert('Attendance saved successfully!')
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save attendance')
      }
    } catch (error) {
      console.error('Failed to save attendance:', error)
      setError(error.message)
      alert('Failed to save attendance: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">ESP32 Connection</h2>
          <p className="text-gray-600">
            Connect to ESP32 device and manage data
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div
            className={`px-3 py-1 rounded-full text-sm ${
              isConnected
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isConnecting ? 'Connecting...' : 'Connect to ESP32'}
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connection Instructions */}
      {!isConnected && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-blue-900 mb-3">
            Connection Instructions
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-blue-800">
            <li>
              Make sure your ESP32 is powered on and running the attendance
              firmware
            </li>
            <li>Ensure Bluetooth is enabled on your device</li>
            <li>
              Click "Connect to ESP32" and select "ESP32-Attendance" from the
              device list
            </li>
            <li>Wait for the connection to establish</li>
          </ol>
        </div>
      )}

      {/* Device Info */}
      {isConnected && deviceInfo && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold mb-4">Device Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Device Name</p>
              <p className="font-medium">
                {deviceInfo.device_name || 'ESP32-Attendance'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Classes Count</p>
              <p className="font-medium">{deviceInfo.classes_count || 0}</p>
            </div>
            {deviceInfo.memory_free && (
              <>
                <div>
                  <p className="text-sm text-gray-600">Free Memory</p>
                  <p className="font-medium">
                    {formatBytes(deviceInfo.memory_free.free)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Used Memory</p>
                  <p className="font-medium">
                    {formatBytes(deviceInfo.memory_free.allocated)}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Storage Info */}
      {isConnected && storageInfo && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Storage Information</h3>
            <button
              onClick={refreshStorageInfo}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              🔄 Refresh
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Storage Usage</span>
                <span>{storageInfo.percent_used?.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${storageInfo.percent_used || 0}%` }}
                ></div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Total</p>
                <p className="font-medium">{formatBytes(storageInfo.total)}</p>
              </div>
              <div>
                <p className="text-gray-600">Used</p>
                <p className="font-medium">{formatBytes(storageInfo.used)}</p>
              </div>
              <div>
                <p className="text-gray-600">Free</p>
                <p className="font-medium">{formatBytes(storageInfo.free)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Sync Section */}
      {isConnected && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold mb-4">Data Synchronization</h3>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">Sync Classes to ESP32</p>
                <p className="text-sm text-gray-600">
                  Send {classes.length} classes with all student data to ESP32
                </p>
                {deviceInfo && deviceInfo.classes_count > 0 && (
                  <p className="text-sm text-green-600 font-medium mt-1">
                    ✅ {deviceInfo.classes_count} classes currently on ESP32
                  </p>
                )}
              </div>
              <button
                onClick={handleSyncData}
                disabled={loading || classes.length === 0}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2"
              >
                {loading && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                <span>{loading ? 'Syncing...' : 'Sync Data'}</span>
              </button>
            </div>

            {syncedData && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Last Synced Data:</h4>
                <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-40">
                  {JSON.stringify(syncedData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attendance Management */}
      {isConnected && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold mb-4">Attendance Management</h3>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">Download Attendance from ESP32</p>
                <p className="text-sm text-gray-600">
                  Retrieve attendance data collected on the device
                </p>
              </div>
              <button
                onClick={handleDownloadAttendance}
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
              >
                {loading && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                <span>
                  {loading ? 'Downloading...' : 'Download Attendance'}
                </span>
              </button>
            </div>

            {attendanceData && Object.keys(attendanceData).length > 0 && (
              <div className="space-y-4">
                <h4 className="font-medium">Attendance Data from ESP32:</h4>
                {Object.entries(attendanceData).map(([classId, data]) => {
                  const classInfo = classes.find((c) => c.id === classId)
                  return (
                    <div key={classId} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h5 className="font-medium">
                            {classInfo?.name || `Class ${classId}`}
                          </h5>
                          <p className="text-sm text-gray-600">
                            {data.total_students} students •{data.present_count}{' '}
                            present •{data.absent_count} absent
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            handleSaveAttendance(classId, data.records)
                          }
                          disabled={loading}
                          className="bg-green-600 text-white px-3 py-1 text-sm rounded hover:bg-green-700 disabled:opacity-50 flex items-center space-x-1"
                        >
                          {loading && (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          )}
                          <span>Save to Database</span>
                        </button>
                      </div>

                      <div className="max-h-32 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {data.records.map((record, index) => (
                            <div key={index} className="flex justify-between">
                              <span>
                                #{record.roll} {record.name}
                              </span>
                              <span
                                className={
                                  record.present
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }
                              >
                                {record.present ? '✅ Present' : '❌ Absent'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {attendanceData && Object.keys(attendanceData).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p>No attendance data found on ESP32</p>
                <p className="text-sm">Take attendance on the device first</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
