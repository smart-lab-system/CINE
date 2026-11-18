class Solution {
    // Function to detect cycle in a directed graph using BFS
    public boolean isCyclic(ArrayList<ArrayList<Integer>> adj) {
        int V = adj.size();
        int[] inDegree = new int[V]; // Array to store in-degrees of each vertex

        // Calculate in-degrees of all vertices
        for (int vertex = 0; vertex < V; vertex++) {
            for (int neighbor : adj.get(vertex)) {
                inDegree[neighbor]++;
            }
        }

        Queue<Integer> queue = new LinkedList<>();

        // Enqueue all vertices with in-degree of 0
        for (int vertex = 0; vertex < V; vertex++) {
            if (inDegree[vertex] == 0) {
                queue.offer(vertex);
            }
        }

        int processedCount = 0; // Counter for processed nodes

        // Process nodes
        while (!queue.isEmpty()) {
            int currentNode = queue.poll();
            processedCount++;

            // Decrease in-degree of neighbors
            for (int neighbor : adj.get(currentNode)) {
                inDegree[neighbor]--;
                if (inDegree[neighbor] == 0) {
                    queue.offer(neighbor);
                }
            }
        }

        // If processedCount is not equal to V, a cycle exists
        return processedCount != V;
    }
}