


class Solution {
    public int isCircle(int n, String[] arr) {
        // Step 1: Create adjacency list
        Map<Character, List<Character>> graph = new HashMap<>();
        Map<Character, Integer> inDegree = new HashMap<>();
        Map<Character, Integer> outDegree = new HashMap<>();
        Set<Character> nodes = new HashSet<>();

        // Initialize graph
        for (String word : arr) {
            char first = word.charAt(0);
            char last = word.charAt(word.length() - 1);

            graph.putIfAbsent(first, new ArrayList<>());
            graph.get(first).add(last);

            outDegree.put(first, outDegree.getOrDefault(first, 0) + 1);
            inDegree.put(last, inDegree.getOrDefault(last, 0) + 1);

            nodes.add(first);
            nodes.add(last);
        }

        // Step 2: Check if in-degree == out-degree for all nodes
        for (char node : nodes) {
            if (!inDegree.getOrDefault(node, 0).equals(outDegree.getOrDefault(node, 0))) {
                return 0; // Condition for Eulerian Circuit fails
            }
        }

        // Step 3: Check if all nodes are in the same strongly connected component
        if (!isConnected(graph, nodes, arr[0].charAt(0))) {
            return 0;
        }

        return 1; // A circle can be formed
    }

    private boolean isConnected(Map<Character, List<Character>> graph, Set<Character> nodes, char start) {
        Set<Character> visited = new HashSet<>();
        dfs(graph, start, visited);

        // Check if all nodes that had edges are visited
        for (char node : nodes) {
            if (graph.containsKey(node) && !visited.contains(node)) {
                return false;
            }
        }
        return true;
    }

    private void dfs(Map<Character, List<Character>> graph, char node, Set<Character> visited) {
        visited.add(node);
        if (graph.containsKey(node)) {
            for (char neighbor : graph.get(node)) {
                if (!visited.contains(neighbor)) {
                    dfs(graph, neighbor, visited);
                }
            }
        }
    }
}