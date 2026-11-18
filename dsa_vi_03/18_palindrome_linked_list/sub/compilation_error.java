

/* Structure of class Node is
class Node
{
    int data;
    Node next;

    Node(int d)
    {
        data = d;
        next = null;
    }
}*/

class Solution {
    // Function to check whether the list is palindrome.
    static boolean isPalindrome(Node head) {
        if(head==null || head.next=null){
            return true;
        }
        Node slow = head;
        Node fast = head;
        while(fast!=null && fast.next!=null){
            slow = slow.next;
            fast = fast.next.next;
        }
        Node prev = null;
        while(slow!=null){
            Node temp = slow.next;
            slow.next = prev;
            prev = slow;
            slow = temp;
        }
        while(prev!=null){
            if(head.data!=prev.data){
                return false;
            }
            head = head.next;
            prev = prev.next;
        }
        return true;
    }
}